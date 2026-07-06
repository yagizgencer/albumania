import { useEffect, useId, useRef, useState } from "react";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import type { Visibility } from "../api/comments";
import { useRegisterUnsaved } from "../lib/unsavedChanges";
import styles from "./CommentComposer.module.css";

export const MAX_COMMENT_LEN = 10000;

interface CommentComposerProps {
  // --- Controlled "field" mode: pass value + onChange (used by the publish
  //     flow, where the parent's own button submits). No submit/cancel buttons. ---
  value?: string;
  onChange?: (text: string) => void;
  visibility?: Visibility;
  onVisibilityChange?: (v: Visibility) => void;

  // --- Uncontrolled "action" mode: pass onSubmit (add/edit a comment). ---
  initialText?: string;
  initialVisibility?: Visibility;
  submitLabel?: string;
  onSubmit?: (text: string, visibility: Visibility) => void | Promise<void>;
  onCancel?: () => void;

  placeholder?: string;
  busy?: boolean;
  // Character cap. Defaults to comment length; the bio field passes a smaller one.
  maxLength?: number;
  // Whether to show the visibility dropdown. Off for fields (e.g. the bio) that
  // aren't per-visibility.
  showVisibility?: boolean;
}

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "friends", label: "Friends only" },
  { value: "private", label: "Private" },
];

export function CommentComposer({
  value,
  onChange,
  visibility: visibilityProp,
  onVisibilityChange,
  initialText = "",
  initialVisibility = "public",
  submitLabel = "Post comment",
  onSubmit,
  onCancel,
  placeholder = "Share your thoughts on this album…",
  busy = false,
  maxLength = MAX_COMMENT_LEN,
  showVisibility = true,
}: CommentComposerProps) {
  const controlled = onChange !== undefined;
  const [innerText, setInnerText] = useState(initialText);
  const [innerVisibility, setInnerVisibility] = useState<Visibility>(initialVisibility);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pickerWrapRef = useRef<HTMLDivElement | null>(null);

  const text = controlled ? value ?? "" : innerText;
  const visibility = controlled ? visibilityProp ?? "public" : innerVisibility;
  const setText = (t: string) =>
    controlled ? onChange!(t.slice(0, maxLength)) : setInnerText(t.slice(0, maxLength));
  const setVisibility = (v: Visibility) =>
    controlled ? onVisibilityChange?.(v) : setInnerVisibility(v);

  useEffect(() => {
    if (!pickerOpen) return;
    function onDoc(e: MouseEvent) {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [pickerOpen]);

  function replaceSelection(makeReplacement: (selected: string) => string, selectInner = true) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const selected = text.slice(start, end);
    const replacement = makeReplacement(selected);
    setText(text.slice(0, start) + replacement + text.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      if (selectInner && selected) {
        // keep the original text selected inside the new markers
        const offset = replacement.indexOf(selected);
        el.setSelectionRange(start + offset, start + offset + selected.length);
      } else {
        const caret = start + replacement.length;
        el.setSelectionRange(caret, caret);
      }
    });
  }

  const wrap = (marker: string) => () =>
    replaceSelection((s) => `${marker}${s || "text"}${marker}`);

  function toList() {
    replaceSelection((s) => {
      if (!s) return "- ";
      return s
        .split("\n")
        .map((line) => (line.startsWith("- ") ? line : `- ${line}`))
        .join("\n");
    }, false);
  }

  function insertEmoji(emoji: string) {
    replaceSelection(() => emoji, false);
  }

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || busy || !onSubmit) return;
    await onSubmit(trimmed, visibility);
    if (!onCancel) setText(""); // add mode: clear after posting
  }

  // Register with the unsaved-changes guard. Only "action" composers (add/edit a
  // comment) own a draft worth protecting — controlled "field" composers (bio,
  // rating publish box) are guarded by their parent. Dirty when the text differs
  // from what it started as. "Save" for the guard = submit this comment.
  const isActionComposer = !controlled && onSubmit !== undefined;
  const composerId = useId();
  const dirty = isActionComposer && text.trim() !== initialText.trim();
  useRegisterUnsaved(composerId, dirty, handleSubmit);

  return (
    <div className={styles.composer}>
      <div className={styles.editor}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolBtn} onClick={wrap("**")} aria-label="Bold" title="Bold">
          <b>B</b>
        </button>
        <button type="button" className={styles.toolBtn} onClick={wrap("*")} aria-label="Italic" title="Italic">
          <i>I</i>
        </button>
        <button type="button" className={styles.toolBtn} onClick={toList} aria-label="Bulleted list" title="Bulleted list">
          ☰
        </button>
        <div className={styles.pickerWrap} ref={pickerWrapRef}>
          <button
            type="button"
            className={styles.toolBtn}
            onClick={() => setPickerOpen((v) => !v)}
            aria-label="Add emoji"
            aria-expanded={pickerOpen}
            title="Emoji"
          >
            😊
          </button>
          {pickerOpen && (
            <div className={styles.pickerPopover}>
              <EmojiPicker
                onEmojiClick={(d: EmojiClickData) => {
                  insertEmoji(d.emoji);
                  setPickerOpen(false);
                }}
                theme={Theme.AUTO}
                width={320}
                height={360}
                lazyLoadEmojis
              />
            </div>
          )}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className={styles.textarea}
        value={text}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        aria-label="Comment text"
      />
      </div>

      <div className={styles.footer}>
        {showVisibility && (
          <label className={styles.visibility}>
            <span className={styles.visibilityLabel}>Visibility:</span>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              aria-label="Comment visibility"
            >
              {VISIBILITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        <span
          className={`${styles.counter} ${text.length >= maxLength ? styles.counterMax : ""}`}
          aria-live="polite"
        >
          {text.length.toLocaleString()} / {maxLength.toLocaleString()}
        </span>

        {!controlled && (
          <div className={styles.actions}>
            {onCancel && (
              <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={busy}>
                Cancel
              </button>
            )}
            <button
              type="button"
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={busy || text.trim().length === 0}
            >
              {busy ? "Saving…" : submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
