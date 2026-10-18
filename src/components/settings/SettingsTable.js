export default function SettingsTable({ children, label }) {
  return <div className="settings-table-scroll"><table className="settings-table" aria-label={label}>{children}</table></div>;
}
