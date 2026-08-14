"use client";

import { useEffect } from "react";

/** 生产环境注册 Service Worker(dev 不注册,避免干扰 HMR) */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {
          /* 注册失败不影响游戏 */
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
