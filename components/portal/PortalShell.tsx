"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { portalNavItems } from "@/lib/portalNav";
import { LogoutButton } from "@/components/LogoutButton";

type PortalShellProps = {
  children: React.ReactNode;
  teacherLabel: string;
};

export function PortalShell({ children, teacherLabel }: PortalShellProps) {
  const pathname = usePathname();
  const confirmItems = portalNavItems.filter((item) => item.section === "confirm");
  const editItems = portalNavItems.filter((item) => item.section === "edit");

  return (
    <div className="portalShell">
      <header className="portalTopBar">
        <div className="portalTopBarTitle">Orenda School</div>
        <div className="portalTopBarMeta">
          <span className="portalTopBarUser">{teacherLabel}</span>
          <LogoutButton />
        </div>
      </header>

      <div className="portalBody">
        <aside className="portalSidebar">
          <div className="portalSidebarTitle">メニュー</div>
          <nav className="portalNav">
            <div className="portalNavSectionLabel">確認画面</div>
            {confirmItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`portalNavItem${isActive ? " portalNavItemActive" : ""}${item.href === "#" ? " portalNavItemDisabled" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={item.href === "#" ? (event) => event.preventDefault() : undefined}
                >
                  {item.label}
                </Link>
              );
            })}

            <div className="portalNavDivider" />
            <div className="portalNavSectionLabel portalNavSectionLabelEdit">編集・登録</div>
            {editItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`portalNavItem portalNavItemEdit${item.href === "#" ? " portalNavItemDisabled" : ""}`}
                onClick={item.href === "#" ? (event) => event.preventDefault() : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="portalMain">{children}</main>
      </div>
    </div>
  );
}
