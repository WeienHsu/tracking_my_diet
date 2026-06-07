"use client";

import { useEffect, useRef } from "react";

// 把瀏覽器時區 offset（分鐘，東為正；台灣 = +480）放進隱藏欄位，
// 讓伺服器以「使用者本地日界」篩選，避免 UTC 伺服器把台灣早上 8 點前的餐誤濾掉（6.2）。
// 用 ref 直接寫 DOM value（非 state），避免 SSR hydration 不一致與 effect 內 setState。
export default function TimezoneField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.value = String(-new Date().getTimezoneOffset());
    }
  }, []);
  return <input ref={ref} type="hidden" name="tzOffset" defaultValue="" />;
}
