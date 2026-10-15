import { Link } from "react-router-dom";
import { useSettings } from "../../context/SettingsContext.jsx";
import { NewsletterForm } from "../newsletter/NewsletterForm.jsx";

const COLS = [
  [
    "Shop",
    [
      ["Men", "/men"],
      ["Women", "/women"],
      ["New arrivals", "/new-arrivals"],
      ["Collections", "/collections"],
      ["Sale", "/sale"],
    ],
  ],
  [
    "Customer care",
    [
      ["Shipping", "/shipping"],
      ["Returns", "/returns-policy"],
      ["Size guide", "/size-guide"],
      ["FAQ", "/faq"],
      ["Track order", "/track-order"],
      ["Contact", "/contact"],
    ],
  ],
  [
    "Company",
    [
      ["About", "/about"],
      ["Journal", "/journal"],
      ["Careers", "/careers"],
    ],
  ],
  [
    "Account",
    [
      ["My account", "/account"],
      ["Orders", "/account/orders"],
      ["Wishlist", "/account/wishlist"],
      ["Bag", "/cart"],
    ],
  ],
];
const LEGAL = [
  ["Privacy", "/privacy"],
  ["Terms", "/terms"],
  ["Cookies", "/cookie-policy"],
  ["Refunds", "/refund-policy"],
];
const SOCIAL = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["youtube", "YouTube"],
];

export function Footer() {
  const { settings } = useSettings();
  const social = SOCIAL.filter(([k]) => settings.social?.[k]); // only what the store has actually configured
  return (
    <footer className="border-t rule mt-24">
      <div className="wrap py-16 grid gap-12 md:grid-cols-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div className="md:col-span-4 lg:col-span-1">
          <p className="font-display text-2xl">
            {settings.storeName?.toUpperCase() ?? "NESSENCE"}
          </p>
          <p className="mt-3 text-muted max-w-xs">
            Contemporary fashion for men and women, designed around cloth, cut
            and quiet detail.
          </p>
          <div className="mt-8">
            <NewsletterForm />
          </div>
        </div>
        {COLS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="eyebrow font-sans !font-semibold">{title}</h2>
            <ul className="mt-4 space-y-2">
              {links.map(([l, to]) => (
                <li key={to}>
                  <Link to={to} className="text-muted hover:text-ink">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wrap border-t rule py-6 text-small text-muted flex flex-wrap gap-x-8 gap-y-3 justify-between">
        <span>
          © {new Date().getFullYear()} {settings.storeName ?? "Nessence"}. All
          rights reserved.
        </span>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LEGAL.map(([l, to]) => (
              <li key={to}>
                <Link to={to} className="hover:text-ink">
                  {l}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {social.length > 0 && (
          <ul aria-label="Social" className="flex gap-6">
            {social.map(([k, l]) => (
              <li key={k}>
                <a
                  href={settings.social[k]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-ink"
                >
                  {l}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
