/**
 * The brand signature: a single ECG trace. Used on the login panel and
 * under the sidebar wordmark.
 */
export default function PulseLine({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 220 40"
      fill="none"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <path
        d="M0 20 H62 L72 20 L78 8 L86 34 L92 14 L97 20 H130 L136 20 L141 12 L148 28 L153 20 H220"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
