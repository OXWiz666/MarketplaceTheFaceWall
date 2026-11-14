"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownUp, ArrowRight, Heart, Search, ShoppingBag, Sparkles } from "lucide-react";
import { CATEGORIES, formatPrice, type Listing } from "@/lib/marketplace";

type ListingCard = Listing & { image_url: string };
export function Marketplace() {
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    const params = new URLSearchParams({ category, sort });
    if (search.trim()) params.set("search", search.trim());
    try {
      const response = await fetch(`/api/listings?${params}`, { signal, cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Listings could not be loaded.");
      setListings(result.listings);
      setCount(result.count);
      setError("");
      setStatus("ready");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Listings could not be loaded.");
      setStatus("error");
    }
  }, [category, search, sort]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), search ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [load, search]);

  return <main className="site-shell">
    <header className="topbar">
      <Link href="/" className="brand" aria-label="TheFaceWall Marketplace home"><span className="brand-mark">F</span><span>TheFaceWall Marketplace</span></Link>
      <nav className="main-nav"><Link className="nav-active" href="/marketplace"><ShoppingBag size={17}/> Browse</Link></nav>
      <div className="top-actions"><Link href="/marketplace/new" className="button button-primary sell-button">＋ Sell an item</Link></div>
    </header>

    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={14}/> GOOD FINDS, CLOSE BY</span><h1>Give good things<br/><span>a second life.</span></h1><p>Discover something lovely. Find a new home for what you don’t need.</p>
        <Link className="hero-link" href="/marketplace/new">Start selling <ArrowRight size={17}/></Link>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="sun-disc"/><div className="hero-bag">✳</div><div className="hero-note note-one">LOVED &amp; FOUND <span>✦</span></div><div className="hero-note note-two">good things travel</div><div className="hero-dot dot-one"/><div className="hero-dot dot-two"/></div>
      <div className="hero-index">01 / YOUR NEIGHBORHOOD FINDS</div>
    </section>

    <section className="browse-section" aria-labelledby="browse-title">
      <div className="section-heading"><div><span className="eyebrow muted">THE COMMUNITY EDIT</span><h2 id="browse-title">Find your next <em>favorite.</em></h2></div><span className="listing-count">{count ? `${count} lovely finds` : "A little something for everyone"}</span></div>
      <div className="search-row"><label className="search-box"><Search size={19}/><span className="sr-only">Search listings</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search treasures, brands, and more…"/></label><label className="sort-select"><ArrowDownUp size={16}/><span className="sr-only">Sort listings</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Recently added</option><option value="oldest">Oldest first</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label></div>
      <div className="category-list" aria-label="Filter by category">{["All", ...CATEGORIES].map((item) => <button key={item} className={`category-chip ${category === item ? "selected" : ""}`} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div>
      {status === "error" && <div role="alert" className="state-card error-state"><span>We couldn’t connect just now.</span><p>{error}</p><button className="button button-secondary" onClick={() => void load()}>Try again</button></div>}
      {status === "loading" && <div className="product-grid" aria-label="Loading listings">{Array.from({ length: 8 }, (_, index) => <div className="product-skeleton" key={index}><div/><span/><span/></div>)}</div>}
      {status === "ready" && listings.length > 0 && <div className="product-grid">{listings.map((listing) => <Link className="product-card" href={`/marketplace/${listing.id}`} key={listing.id}>
        <div className="product-image"><Image src={listing.image_url} alt={listing.title} fill unoptimized sizes="(max-width: 700px) 50vw, (max-width: 1000px) 33vw, 25vw"/><span className="image-badge">{listing.category}</span><span className="favorite-mark" aria-hidden="true"><Heart size={18}/></span></div>
        <div className="product-info"><span className="product-price">{formatPrice(Number(listing.price))}</span><h3>{listing.title}</h3><span className="product-date">{new Date(listing.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span></div>
      </Link>)}</div>}
      {status === "ready" && listings.length === 0 && <div className="state-card empty-state"><span className="empty-icon">✳</span><h3>No finds just yet.</h3><p>Try another search or be the first to list something.</p><Link className="button button-primary" href="/marketplace/new">Create a listing</Link></div>}
    </section>
    <footer className="site-footer"><Link href="/" className="brand" aria-label="TheFaceWall Marketplace home"><span className="brand-mark">F</span><span>TheFaceWall Marketplace</span></Link><span>Good things find good homes.</span><Link href="/marketplace/new">Have something to sell? <ArrowRight size={14}/></Link></footer>
  </main>;
}
