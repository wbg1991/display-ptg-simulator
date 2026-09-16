/** Small, reusable form-control builders shared by the sidebar and viewport toolbar. */

export function section(title: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "flex flex-col gap-2 border-b border-white/5 pb-4";
  const h = document.createElement("h3");
  h.className = "text-[11px] font-semibold uppercase tracking-wide text-neutral-500";
  h.textContent = title;
  el.appendChild(h);
  return el;
}

export function numberField(
  label: string,
  value: number,
  opts: { min?: number; max?: number; step?: number; suffix?: string; onChange: (v: number) => void },
): HTMLElement {
  const row = document.createElement("label");
  row.className = "flex items-center justify-between gap-2 text-[12px] text-neutral-300";
  const span = document.createElement("span");
  span.textContent = label;
  const inputWrap = document.createElement("div");
  inputWrap.className = "flex items-center gap-1";
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(value);
  if (opts.min !== undefined) input.min = String(opts.min);
  if (opts.max !== undefined) input.max = String(opts.max);
  if (opts.step !== undefined) input.step = String(opts.step);
  input.className =
    "w-24 rounded border border-white/10 bg-neutral-800 px-2 py-1 text-right mono-nums text-neutral-100 focus:border-sky-500 focus:outline-none";
  input.addEventListener("change", () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) opts.onChange(v);
  });
  inputWrap.appendChild(input);
  if (opts.suffix) {
    const suffix = document.createElement("span");
    suffix.className = "w-8 text-neutral-500";
    suffix.textContent = opts.suffix;
    inputWrap.appendChild(suffix);
  }
  row.appendChild(span);
  row.appendChild(inputWrap);
  return row;
}

export function selectField<T extends string>(
  label: string,
  value: T,
  options: { value: T; label: string }[],
  onChange: (v: T) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "flex items-center justify-between gap-2 text-[12px] text-neutral-300";
  const span = document.createElement("span");
  span.textContent = label;
  const select = document.createElement("select");
  select.className =
    "min-w-0 max-w-[160px] rounded border border-white/10 bg-neutral-800 px-2 py-1 text-neutral-100 focus:border-sky-500 focus:outline-none";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === value) o.selected = true;
    select.appendChild(o);
  }
  select.addEventListener("change", () => onChange(select.value as T));
  row.appendChild(span);
  row.appendChild(select);
  return row;
}

export function checkboxField(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement("label");
  row.className = "flex items-center justify-between gap-2 text-[12px] text-neutral-300";
  const span = document.createElement("span");
  span.textContent = label;
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.className = "h-4 w-4 accent-sky-500";
  input.addEventListener("change", () => onChange(input.checked));
  row.appendChild(span);
  row.appendChild(input);
  return row;
}

export function rangeField(
  label: string,
  value: number,
  opts: { min: number; max: number; step: number; format?: (v: number) => string; onInput: (v: number) => void },
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "flex flex-col gap-0.5 text-[12px] text-neutral-300";
  const top = document.createElement("div");
  top.className = "flex items-center justify-between gap-2";
  const span = document.createElement("span");
  span.textContent = label;
  const valueSpan = document.createElement("span");
  valueSpan.className = "mono-nums text-neutral-400";
  valueSpan.textContent = opts.format ? opts.format(value) : String(value);
  top.append(span, valueSpan);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(value);
  input.className = "w-full accent-sky-500";
  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    valueSpan.textContent = opts.format ? opts.format(v) : String(v);
    opts.onInput(v);
  });

  wrap.append(top, input);
  return wrap;
}

export function buttonEl(label: string, onClick: () => void, variant: "primary" | "ghost" = "ghost"): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className =
    variant === "primary"
      ? "rounded bg-sky-600 px-2 py-1 text-[12px] font-medium text-white hover:bg-sky-500"
      : "rounded border border-white/15 px-2 py-1 text-[12px] text-neutral-300 hover:bg-white/5";
  btn.addEventListener("click", onClick);
  return btn;
}

export function badge(text: string, tone: "info" | "warning" | "error" = "info"): HTMLElement {
  const el = document.createElement("span");
  const tones: Record<string, string> = {
    info: "bg-sky-500/15 text-sky-300",
    warning: "bg-amber-500/15 text-amber-300",
    error: "bg-red-500/15 text-red-300",
  };
  el.className = `inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${tones[tone]}`;
  el.textContent = text;
  return el;
}
