import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  setRecentRepos: (repos) => ipcRenderer.send("recent-repos", repos),
  setCurrentRepo: (repoPath) => ipcRenderer.send("current-repo", repoPath),
  notify: (title, body) => ipcRenderer.send("notify", { title, body }),
  storeApiKey: (encrypted) => ipcRenderer.invoke("store-api-key", encrypted),
  loadApiKey: () => ipcRenderer.invoke("load-api-key"),
  clearApiKey: () => ipcRenderer.invoke("clear-api-key"),
  onOpenRepo: (callback) => {
    const listener = (_, path) => callback(path);
    ipcRenderer.on("tray-open-repo", listener);
    return () => ipcRenderer.removeListener("tray-open-repo", listener);
  },
  onPullRepo: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("tray-pull-repo", listener);
    return () => ipcRenderer.removeListener("tray-pull-repo", listener);
  },
});
