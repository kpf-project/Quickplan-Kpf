"use client";

import styles from "./GroupedPageNavigation.module.css";

// Callers filter permissions; navigation never grants access to data or actions.
export default function GroupedPageNavigation({ groups, value, onChange, leading, trailing, status, compact = false, label = "เมนูงาน" }) {
  const visibleGroups = groups.map((group) => ({ ...group, items: group.items.filter((item) => item.visible !== false) })).filter((group) => group.visible !== false && group.items.length);
  const activeGroup = visibleGroups.find((group) => group.items.some((item) => item.key === value)) || visibleGroups[0];
  if (!activeGroup) return null;
  return (
    <nav aria-label={label} className={`${styles.navigation} ${compact ? styles.compact : ""}`}>
      <div className={styles.top}>
        {leading}
        <div className={styles.groups} aria-label="กลุ่มงาน">
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            return <button key={group.key} type="button" aria-pressed={group.key === activeGroup.key} onClick={() => { if (group.key !== activeGroup.key) onChange(group.items[0].key); }}>{Icon ? <Icon size={23} aria-hidden="true" /> : null}{group.label}</button>;
          })}
        </div>
        <div className={styles.trailing}>{trailing}</div>
      </div>
      <div className={styles.bottom}>
        <div className={styles.items}>
          {activeGroup.items.map((item) => {
            const Icon = item.icon;
            return <button key={item.key} type="button" aria-current={item.key === value ? "page" : undefined} onClick={() => onChange(item.key)}>{Icon ? <Icon size={25} aria-hidden="true" /> : null}{item.label}</button>;
          })}
        </div>
        {status}
      </div>
    </nav>
  );
}
