export default function VipLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 'calc(-1 * var(--app-header-offset))' }}>
      {children}
    </div>
  );
}
