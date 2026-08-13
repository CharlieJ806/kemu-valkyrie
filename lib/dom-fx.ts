/* DOM floating damage numbers, FX text, particle bursts */

export function spawnDmg(
  layer: HTMLElement | null,
  xPct: number,
  yPct: number,
  text: string,
  color?: string,
  big?: boolean,
): void {
  if (!layer || typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "dmg-num";
  el.textContent = text;
  el.style.left = xPct + "%";
  el.style.top = yPct + "%";
  el.style.color = color || "#fff";
  if (big) el.style.fontSize = "34px";
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

export function spawnFxText(
  layer: HTMLElement | null,
  xPct: number,
  yPct: number,
  text: string,
  color?: string,
): void {
  if (!layer || typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "fx-text";
  el.textContent = text;
  el.style.left = xPct + "%";
  el.style.top = yPct + "%";
  el.style.color = color || "#0ff";
  layer.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

export function domBurst(
  layer: HTMLElement | null,
  xPct: number,
  yPct: number,
  color: string,
  n?: number,
): void {
  if (!layer || typeof document === "undefined") return;
  for (let i = 0; i < (n || 14); i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const sz = 3 + Math.random() * 5;
    p.style.cssText = `left:${xPct}%;top:${yPct}%;width:${sz}px;height:${sz}px;background:${color};box-shadow:0 0 6px ${color}`;
    layer.appendChild(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 70;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 20;
    const anim = p.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) scale(0)`, opacity: 0 },
      ],
      { duration: 500 + Math.random() * 400, easing: "cubic-bezier(.1,.7,.3,1)" },
    );
    anim.onfinish = () => p.remove();
  }
}
