"use client";

export default function Star({
  filled,
  onClick,
  disabled,
  className = "",
}: {
  filled: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      aria-pressed={filled}
      title={filled ? "Saved — click to unsave" : "Save for later"}
      className={`star ${filled ? "on" : ""} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      >
        <path d="M12 3.2l2.6 5.55 6.1.82-4.45 4.2 1.12 6.01L12 17.1l-5.48 2.88 1.12-6.01-4.45-4.2 6.1-.82L12 3.2z" />
      </svg>
    </button>
  );
}
