"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ArrowDownUp, ArrowRight, Search } from "lucide-react";
import { CATEGORIES, formatPrice, type Listing } from "@/lib/marketplace";
import { MarketplaceFrame } from "@/components/marketplace-chrome";

type ListingCard = Listing & { image_url: string };
type ApiResult = { listings: ListingCard[]; count: number; page: number; pageSize: number; error?: string; code?: string };

function apiError(result: ApiResult, fallback: string) {
  if (result.code === "42P01" || result.code === "PGRST205") return "Marketplace database tables are missing. Apply the latest Supabase migrations.";
  if (result.code === "42501" || result.code === "PGRST301") return "Supabase denied access to marketplace data. Apply the latest database access policies.";
  return result.error ?? (result.code ? `${fallback} (database error ${result.code})` : fallback);
}

export function Marketplace() {
  const [listings, setListings] = useState<ListingCard[]>([]);
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialCategory = params.get("category");
    if (initialCategory === "All" || CATEGORIES.includes(initialCategory as (typeof CATEGORIES)[number])) setCategory(initialCategory as string);
    setSearch(params.get("search") ?? "");
    const initialSort = params.get("sort");
    if (["newest", "oldest", "price-asc", "price-desc"].includes(initialSort ?? "")) setSort(initialSort!);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setStatus("loading");
    const params = new URLSearchParams({ category, sort });
    if (search.trim()) params.set("search", search.trim());
    try {
      const response = await fetch(`/api/listings?${params}`, { signal, cache: "no-store" });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(apiError(result, "Listings could not be loaded."));
      setListings(result.listings);
      setCount(result.count);
      setPage(0);
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

  async function loadMore() {
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ category, sort, page: String(page + 1) });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/listings?${params}`, { cache: "no-store" });
      const result = await response.json() as ApiResult;
      if (!response.ok) throw new Error(apiError(result, "More listings could not be loaded."));
      setListings((current) => [...current, ...result.listings]);
      setPage(result.page);
      setCount(result.count);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "More listings could not be loaded."); }
    finally { setLoadingMore(false); }
  }

  function updateCategory(value: string) {
    setCategory(value);
    const params = new URLSearchParams(window.location.search);
    if (value === "All") params.delete("category"); else params.set("category", value);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
  }

  const hasMore = listings.length < count;
  return <MarketplaceFrame category={category} onCategoryChange={updateCategory}>
    <div className="content-heading"><div><p className="heading-kicker">DISCOVER YOUR COMMUNITY</p><h1>{search ? "Search results" : "Today's picks"}</h1><p className="heading-subtitle">Find something you love, right around the corner.</p></div><Link className="button new-listing-button" href="/marketplace/new">+ Create new listing</Link></div>
    <div className="listing-toolbar"><label className="listing-search"><Search size={18}/><span className="sr-only">Search listings</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search listings"/></label><label className="sort-control"><ArrowDownUp size={16}/><span className="sr-only">Sort listings</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></label></div>
    <nav className="mobile-categories" aria-label="Filter by category"><button className={category === "All" ? "active" : ""} onClick={() => updateCategory("All")}>All</button>{CATEGORIES.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => updateCategory(item)}>{item}</button>)}</nav>
    <section className="listing-results" aria-labelledby="results-title"><div className="results-heading"><h2 id="results-title">{search || category !== "All" ? "Marketplace listings" : "Today's picks"}</h2>{status === "ready" && <span>{count} {count === 1 ? "listing" : "listings"}</span>}</div>
      {status === "error" && <div role="alert" className="state-card error-state"><h3>Listings couldn't be loaded.</h3><p>{error}</p><button className="button secondary-button" onClick={() => void load()}>Try again</button></div>}
      {status === "loading" && <div className="product-grid" aria-label="Loading listings">{Array.from({ length: 10 }, (_, index) => <div className="product-skeleton" key={index}><div/><span/><span/></div>)}</div>}
      {status === "ready" && listings.length > 0 && <div className="product-grid">{listings.map((listing, index) => <Link className="product-card" href={`/marketplace/${listing.id}`} key={listing.id} style={{ animationDelay: `${Math.min(index * 35, 245)}ms` }}>
        <div className="product-image"><Image src={listing.image_url} alt={listing.title} fill unoptimized sizes="(max-width: 700px) 50vw, (max-width: 1100px) 33vw, 20vw"/><span className="image-category">{listing.category}</span></div>
        <div className="product-info"><span className="product-price">{formatPrice(Number(listing.price))}</span><h3>{listing.title}</h3><span className="product-location">{new Date(listing.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })} � {listing.category}</span></div>
      </Link>)}</div>}
      {status === "ready" && listings.length === 0 && <div className="state-card empty-state"><span className="empty-icon">?</span><h3>No listings found</h3><p>Try a different search, or create the first listing in this category.</p><Link className="button new-listing-button" href="/marketplace/new">Create a listing</Link></div>}
      {error && status === "ready" && <p className="inline-error" role="alert">{error}</p>}
      {status === "ready" && hasMore && <div className="load-more-wrap"><button className="button secondary-button load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Loading." : "See more listings"}<ArrowRight size={16}/></button></div>}
    </section>
  </MarketplaceFrame>;
}

