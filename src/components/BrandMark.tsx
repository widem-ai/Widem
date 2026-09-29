// The Widem chip mark (same drawing as the prototype's header and footer logo).
export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="14" height="14" rx="3" />
      <path d="M9 5V2M15 5V2M9 22v-3M15 22v-3M5 9H2M5 15H2M22 9h-3M22 15h-3" />
    </svg>
  );
}
