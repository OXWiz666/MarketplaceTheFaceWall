import Link from "next/link";
import { ArrowRight, CircleHelp, ListPlus, Search, ShoppingBag } from "lucide-react";
import type { ReactNode } from "react";
import { CATEGORIES } from "@/lib/marketplace";

export function MarketplaceHeader() {
  return <header className="market-header">
    <div className="market-header-inner">
      <Link href="/" className="market-brand" aria-label="TheFaceWall Marketplace home"><span className="market-brand-mark">F</span><span>TheFaceWall Marketplace</span></Link>
      <form className="header-search" action="/" method="get"><Search size={18}/><label className="sr-only" htmlFor="header-query">Search listings</label><input id="header-query" name="search" placeholder="Search Marketplace" /></form>
      <Link className="button header-sell" href="/marketplace/new"><ListPlus size={18}/><span>Sell an item</span></Link>
    </div>
  </header>;
}

export function MarketplaceSidebar({ category = "All", onCategoryChange }: { category?: string; onCategoryChange?: (value: string) => void }) {
  return <aside className="market-sidebar">
    <div className="sidebar-card">
      <h2>TheFaceWall Marketplace</h2>
      <nav className="sidebar-actions" aria-label="Marketplace navigation">
        <Link href="/marketplace/new"><span className="sidebar-icon"><ListPlus size={19}/></span><span>Create new listing</span><ArrowRight size={15}/></Link>
        <Link href="/"><span className="sidebar-icon"><ShoppingBag size={19}/></span><span>Browse listings</span><ArrowRight size={15}/></Link>
        <a href="#seller-help"><span className="sidebar-icon"><CircleHelp size={19}/></span><span>Seller help</span><ArrowRight size={15}/></a>
      </nav>
      <div className="sidebar-divider"/>
      <div className="sidebar-heading"><h3>Categories</h3>{category !== "All" && <button onClick={() => onCategoryChange?.("All")}>Clear</button>}</div>
      <nav className="category-sidebar" aria-label="Filter listings by category">
        <CategoryLink label="All categories" value="All" active={category === "All"} onSelect={onCategoryChange}/>
        {CATEGORIES.map((item) => <CategoryLink key={item} label={item} value={item} active={category === item} onSelect={onCategoryChange}/>)}
      </nav>
      <div className="seller-help" id="seller-help"><h3>Buy and sell with care</h3><p>Meet in a public place, check an item before paying, and never share passwords or verification codes.</p></div>
    </div>
  </aside>;
}

function CategoryLink({ label, value, active, onSelect }: { label: string; value: string; active: boolean; onSelect?: (value: string) => void }) {
  if (onSelect) return <button className={`category-sidebar-link ${active ? "active" : ""}`} onClick={() => onSelect(value)} aria-pressed={active}>{label}</button>;
  return <Link className="category-sidebar-link" href={value === "All" ? "/" : `/?category=${encodeURIComponent(value)}`}>{label}</Link>;
}

export function MarketplaceFrame({ children, category, onCategoryChange }: { children: ReactNode; category?: string; onCategoryChange?: (value: string) => void }) {
  return <div className="app-root"><MarketplaceHeader/><div className="market-layout"><MarketplaceSidebar category={category} onCategoryChange={onCategoryChange}/><main className="market-content">{children}</main></div></div>;
}

