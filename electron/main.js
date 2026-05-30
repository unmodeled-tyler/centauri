import {
  app,
  BrowserWindow,
  Notification,
  shell,
  Tray,
  Menu,
  ipcMain,
  globalShortcut,
  nativeImage,
  safeStorage,
} from "electron";
import net from "net";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));

function getUrlArg() {
  const arg = process.argv.find((value) => value.startsWith("--url="));
  return arg ? arg.slice("--url=".length) : null;
}

async function resolveAppUrl() {
  const explicitUrl = getUrlArg();
  if (explicitUrl) return explicitUrl;
  if (!app.isPackaged) return "http://127.0.0.1:5173";
  return startPackagedServer();
}

function repoDisplayName(path) {
  const cleaned = path.replace(/[\\/]+$/, "");
  const base = cleaned.split(/[\\/]/).pop();
  return base || cleaned;
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let packagedServer = null;

/** @type {Array<{name: string, path: string}>} */
let recentRepos = [];
/** @type {string | null} */
let currentRepoPath = null;

const MAX_RECENT_IN_TRAY = 8;
const TOGGLE_SHORTCUT = "CommandOrControl+Alt+G";

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    } else {
      void createWindow();
    }
  });
  registerLifecycle();
}

function registerLifecycle() {
  app.on("before-quit", () => {
    isQuitting = true;
    if (packagedServer) {
      packagedServer.close();
      packagedServer = null;
    }
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });

  // IPC handlers are registered at module scope so they catch any early
  // renderer messages; the tray may not exist yet, in which case updateTray()
  // no-ops and the next renderer send after tray creation wins.
  ipcMain.on("recent-repos", (_event, repos) => {
    if (!Array.isArray(repos)) return;
    recentRepos = repos.filter(
      (r) => r && typeof r.name === "string" && typeof r.path === "string",
    );
    updateTray();
  });

  ipcMain.on("current-repo", (_event, repoPath) => {
    currentRepoPath = typeof repoPath === "string" && repoPath ? repoPath : null;
    updateTray();
  });

  ipcMain.on("notify", (_event, payload) => {
    if (!payload || typeof payload.title !== "string") return;
    if (!Notification.isSupported()) return;
    new Notification({
      title: payload.title,
      body: typeof payload.body === "string" ? payload.body : "",
    }).show();
  });

  // Secure API key storage using Electron's safeStorage
  ipcMain.handle("store-api-key", (_event, plaintext) => {
    if (!safeStorage.isEncryptionAvailable()) return;
    app.setLoginItemSettings({ openAtLogin: false });
    const keyPath = join(app.getPath("userData"), "quanta-ai-key");
    try {
      const encrypted = safeStorage.encryptString(plaintext);
      writeFileSync(keyPath, encrypted.toString("base64"), { mode: 0o600, encoding: "utf-8" });
    } catch {
      // ignored
    }
  });

  ipcMain.handle("load-api-key", () => {
    if (!safeStorage.isEncryptionAvailable()) return "";
    const keyPath = join(app.getPath("userData"), "quanta-ai-key");
    if (!existsSync(keyPath)) return "";
    try {
      const encrypted = readFileSync(keyPath, "utf-8");
      return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
      return "";
    }
  });

  ipcMain.handle("clear-api-key", () => {
    const keyPath = join(app.getPath("userData"), "quanta-ai-key");
    if (existsSync(keyPath)) {
      try { unlinkSync(keyPath); } catch { /* ignored */ }
    }
  });

  app.whenReady().then(() => {
    void createWindow();
    createTray();

    const registered = globalShortcut.register(TOGGLE_SHORTCUT, toggleMainWindow);
    if (!registered) {
      console.warn(
        `[centauri] Failed to register global shortcut "${TOGGLE_SHORTCUT}" (likely already taken by another app).`,
      );
    }
  });
}

function toggleMainWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  } else {
    void createWindow();
  }
}

function isPortAvailable(port) {
  return new Promise((resolveAvailability) => {
    const server = net.createServer();

    server.once("error", () => {
      resolveAvailability(false);
    });

    server.once("listening", () => {
      server.close(() => resolveAvailability(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 100; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find an open port starting at ${startPort}`);
}

async function startPackagedServer() {
  if (packagedServer) {
    const address = packagedServer.address();
    const port = address && typeof address === "object" ? address.port : 4123;
    return `http://127.0.0.1:${port}`;
  }

  const serverEntryCandidates = [
    join(app.getAppPath(), "build", "server", "server", "index.js"),
    join(app.getAppPath(), "build", "server", "index.js"),
  ];
  const serverEntry = serverEntryCandidates.find((candidate) => existsSync(candidate));
  if (!serverEntry) {
    throw new Error("Could not find the packaged Centauri server entry.");
  }

  const port = await findFreePort(4123);
  process.env.NODE_ENV = "production";
  process.env.CENTAURI_CLI = "1";
  process.env.PORT = String(port);
  process.env.HOST = "127.0.0.1";

  const { startServer } = await import(serverEntry);
  const started = await startServer({ port, host: "127.0.0.1" });
  packagedServer = started.server;

  return `http://127.0.0.1:${port}`;
}

async function createWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    show: false,
    title: "Centauri",
    webPreferences: {
      preload: join(here, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Closing the window hides it so the app persists in the tray. When the
  // user actually quits (tray Quit, Cmd+Q, app.quit), before-quit flips
  // isQuitting so this handler steps aside and the real close proceeds.
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });

  try {
    await mainWindow.loadURL(await resolveAppUrl());
  } catch (err) {
    console.error("[centauri] Failed to load app window:", err);
  }
}

const TRAY_ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAXklEQVQ4T2NkYGD4z0ABYBw1gGE0"
  + "DIBx1AAYRw2AcRQAUEcNgGEUAwAHdQDYRzEAcFAHgH0UAwAHdQDYRzEAcFAHgH0UAwAHdQDYRzEA"
  + "cFAHgH0UAwA11w1Qd5l1lAAAAABJRU5ErkJggg==";

let cachedTrayIcon = null;

function getTrayIcon() {
  if (!cachedTrayIcon) {
    cachedTrayIcon = nativeImage.createFromBuffer(Buffer.from(TRAY_ICON_PNG, "base64"));
    if (process.platform === "darwin") {
      cachedTrayIcon.setTemplateImage(true);
    }
  }
  return cachedTrayIcon;
}

function buildContextMenu() {
  const recentSubmenu = recentRepos.slice(0, MAX_RECENT_IN_TRAY).map((repo) => ({
    label: repo.name,
    click: () => {
      if (mainWindow) {
        mainWindow.webContents.send("tray-open-repo", repo.path);
        mainWindow.show();
        mainWindow.focus();
      }
    },
  }));

  if (recentSubmenu.length === 0) {
    recentSubmenu.push({ label: "No recent repos", enabled: false });
  }

  const currentRepoItems = currentRepoPath
    ? [
        {
          label: `Pull "${repoDisplayName(currentRepoPath)}"`,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send("tray-pull-repo");
            }
          },
        },
        { type: "separator" },
      ]
    : [];

  return Menu.buildFromTemplate([
    ...currentRepoItems,
    {
      label: "Open Recent Repo",
      submenu: recentSubmenu,
    },
    { type: "separator" },
    {
      label: "Show Window",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          void createWindow();
        }
      },
    },
    {
      label: "Hide Window",
      click: () => {
        if (mainWindow) mainWindow.hide();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

function updateTray() {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu());
}

function createTray() {
  if (tray) return;
  tray = new Tray(getTrayIcon());
  tray.setToolTip("Centauri");
  tray.setContextMenu(buildContextMenu());

  tray.on("click", () => {
    toggleMainWindow();
  });

  tray.on("double-click", () => {
	  if (mainWindow) {
	    mainWindow.show();
	    mainWindow.focus();
	  } else {
	    void createWindow();
	  }
	});
}
