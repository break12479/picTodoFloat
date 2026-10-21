import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import Icon from "./Icon";

export interface SelectOption<V> {
  value: V;
  label: string;
}

interface Props<V> {
  value: V;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  className?: string;
  title?: string;
  ariaLabel?: string;
}

/**
 * 紧凑下拉（替代原生 <select>）：原生下拉的弹出列表由系统绘制，是直角的，
 * 和应用里其它圆角菜单不搭，所以弹出部分改用 .popover 自己画。
 * 和 TaskMenu 一样走 portal + fixed 定位，靠近窗口底部时向上翻。
 */
export default function SelectChip<V extends string | number>({
  value,
  options,
  onChange,
  className,
  title,
  ariaLabel,
}: Props<V>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, minWidth: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  const pick = (v: V) => {
    close();
    if (v !== value) onChange(v);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const btnEl = btnRef.current;
    const menu = menuRef.current;
    if (!btnEl || !menu) return;
    const btn = btnEl.getBoundingClientRect();
    // 弹出动画带 scale，尺寸用 offset* 取未变换的值
    const height = menu.offsetHeight;
    // 让选项文字和按钮文字左对齐：菜单向左让出「菜单边框 + 内边距」比按钮内边距多出的那段，
    // 两侧各多出这么宽（输入栏里正好和外框左边线对齐）
    const textEl = menu.querySelector<HTMLElement>(".popover-text");
    const textOffset = textEl ? menu.clientLeft + textEl.offsetLeft : 0;
    const shift = Math.max(0, textOffset - parseFloat(getComputedStyle(btnEl).paddingLeft));
    const minWidth = btn.width + shift * 2;
    const width = Math.max(menu.offsetWidth, minWidth);
    // 上下也让出同样的距离，免得压到输入栏的外框
    const gap = shift + 4;
    const margin = 4;
    const left = Math.max(margin, Math.min(btn.left - shift, window.innerWidth - width - margin));
    let top = btn.bottom + gap;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, btn.top - height - gap);
    }
    setPos({ left, top, minWidth });
    menu.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    // 和 HotkeyField 一样截住，别让 Esc 顺带关掉设置面板 / 取消选中
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + step + options.length) % options.length);
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      const o = options[active];
      if (o) pick(o.value);
    } else if (e.key === "Tab") {
      close(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`select-chip${open ? " open" : ""}${className ? ` ${className}` : ""}`}
        title={title}
        aria-label={ariaLabel ?? title}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
      >
        {current?.label ?? ""}
      </button>

      {open &&
        createPortal(
          // portal 后合成事件仍会沿组件树冒泡（任务行选中 / 面板点击关闭），这里截住
          <div
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="popover-backdrop"
              onClick={() => close(false)}
              onContextMenu={(e) => {
                e.preventDefault();
                close(false);
              }}
            />
            <div
              ref={menuRef}
              className="popover select-menu"
              role="listbox"
              tabIndex={-1}
              style={{ left: pos.left, top: pos.top, minWidth: pos.minWidth }}
              onKeyDown={onMenuKey}
            >
              <div className="popover-scroll">
                {options.map((o, i) => (
                  <div
                    key={String(o.value)}
                    data-index={i}
                    role="option"
                    aria-selected={o.value === value}
                    className={`popover-item${i === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o.value)}
                  >
                    <span className="popover-text">{o.label}</span>
                    <span className="popover-check">
                      {o.value === value && <Icon name="check" size={13} />}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
