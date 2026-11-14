import Link from "next/link";

export default function NotFound() {
  return <main className="not-found"><span className="brand-mark">m</span><h1>That page wandered off.</h1><p>Let’s get you back to the good finds.</p><Link className="button button-primary" href="/">Back to Marketday</Link></main>;
}
