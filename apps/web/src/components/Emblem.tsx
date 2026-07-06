/** Stylized Ashoka-chakra emblem used in the masthead, hero, footer and portals. */
export default function Emblem({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`emblem ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth={3} style={{ width: size * 0.75, height: size * 0.75 }}>
        <circle cx="50" cy="50" r="30" />
        <circle cx="50" cy="50" r="6" fill="currentColor" />
        <line x1="50" y1="20" x2="50" y2="80" />
        <line x1="20" y1="50" x2="80" y2="50" />
        <line x1="29" y1="29" x2="71" y2="71" />
        <line x1="71" y1="29" x2="29" y2="71" />
        <line x1="38" y1="22" x2="62" y2="78" />
        <line x1="62" y1="22" x2="38" y2="78" />
        <line x1="22" y1="38" x2="78" y2="62" />
        <line x1="78" y1="38" x2="22" y2="62" />
      </svg>
    </span>
  );
}
