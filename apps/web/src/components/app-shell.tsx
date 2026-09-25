"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Sun,
  Users,
  Wallet,
  ClipboardCheck,
  ClipboardList,
  School,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogoutButton } from "@/components/logout-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { upcomingSections } from "@/lib/navigation";

const sectionIcons = {
  students: Users,
  teachers: GraduationCap,
  parents: Users,
  classes: School,
  attendance: ClipboardCheck,
  fees: Wallet,
  exams: ClipboardList,
};

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <BookOpen size={21} strokeWidth={2.5} />
      </span>
      <span>
        Class<span className="brand-accent">Loom</span>
      </span>
    </div>
  );
}

function SidebarContents({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div className="sidebar-brand">
        <Brand />
      </div>
      <div className="workspace-switcher">
        <span className="workspace-icon">
          <School size={19} />
        </span>
        <span className="workspace-name">
          <strong>ClassLoom</strong>
          <small>School workspace</small>
        </span>
        <ChevronDown size={15} />
      </div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        <p className="nav-caption">MAIN MENU</p>
        <Link
          href="/"
          className={`nav-row ${pathname === "/" || pathname === "/dashboard" ? "nav-row-active" : ""}`}
          aria-current={pathname === "/" || pathname === "/dashboard" ? "page" : undefined}
          onClick={onNavigate}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
          <ChevronRight className="nav-chevron" size={16} />
        </Link>
        <p className="nav-caption nav-caption-spaced">ACADEMIC</p>
        <Link href="/academic-setup" className={`nav-row ${pathname === "/academic-setup" ? "nav-row-active" : ""}`} aria-current={pathname === "/academic-setup" ? "page" : undefined} onClick={onNavigate}>
          <School size={18} /><span>Academic Setup</span><ChevronRight className="nav-chevron" size={16} />
        </Link>
        <p className="nav-caption nav-caption-spaced">SCHOOL MANAGEMENT <span className="preview-label">SOON</span></p>
        {upcomingSections.filter((section) => section.icon !== "classes").map((section) => {
          const Icon = sectionIcons[section.icon];
          return (
            <div
              key={section.label}
              className="nav-row nav-row-disabled"
              aria-disabled="true"
              title="Coming in a later phase"
            >
              <Icon size={18} />
              <span>{section.label}</span>
              <ChevronRight className="nav-chevron" size={15} />
            </div>
          );
        })}
        <p className="nav-caption nav-caption-spaced">SUPPORT</p>
        <div className="nav-row nav-row-disabled" aria-disabled="true">
          <CircleHelp size={18} />
          <span>Help & Support</span>
        </div>
        <div className="nav-row nav-row-disabled" aria-disabled="true">
          <Settings2 size={18} />
          <span>Settings</span>
        </div>
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-footer-icon">
          <GraduationCap size={18} />
        </div>
        <div>
          <strong>Built for every school</strong>
          <small>School management</small>
        </div>
      </div>
    </>
  );
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    (notify) => {
      window.addEventListener("classloom-theme-change", notify);
      return () => window.removeEventListener("classloom-theme-change", notify);
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("classloom-theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("classloom-theme-change"));
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </Button>
  );
}

export function AppShell({ children, accountName = "School account", accountEmail = "" }: { children: React.ReactNode; accountName?: string; accountEmail?: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <SidebarContents />
      </aside>
      <div className="app-main">
        <header className="site-header">
          <div className="header-leading">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mobile-menu"
                    aria-label="Open navigation"
                  />
                }
              >
                <Menu size={21} />
              </SheetTrigger>
              <SheetContent
                side="left"
                className="mobile-sidebar"
                showCloseButton
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Navigation</SheetTitle>
                  <SheetDescription>ClassLoom pages</SheetDescription>
                </SheetHeader>
                <SidebarContents onNavigate={() => setMenuOpen(false)} />
              </SheetContent>
            </Sheet>
            <span className="header-greeting">Welcome to ClassLoom</span>
          </div>
          <div className="header-actions">
            <span className="header-search">
              <Search size={17} />
              <span>Search anything...</span>
              <kbd>⌘ K</kbd>
            </span>
            <ThemeToggle />
            <span
              className="header-icon-muted"
              aria-label="Notifications coming later"
              title="Notifications coming later"
            >
              <Bell size={19} />
              <i />
            </span>
            <span className="header-divider" />
            <Avatar size="default">
              <AvatarFallback className="profile-avatar">{accountName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="profile-name">
              <strong>{accountName}</strong>
              <small>{accountEmail}</small>
            </span>
            <LogoutButton />
          </div>
        </header>
        <main className="main-content">{children}</main>
        <footer className="site-footer">
          <span>© 2026 ClassLoom. All rights reserved.</span>
          <span>Built with care for schools</span>
        </footer>
      </div>
    </div>
  );
}
