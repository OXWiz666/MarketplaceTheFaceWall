import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><span className="market-brand-mark">F</span><h1>That page wandered off.</h1><p>Let's get you back to the good finds.</p><Link className="button new-listing-button" href="/">Back to TheFaceWall Marketplace</Link></main>;
}

