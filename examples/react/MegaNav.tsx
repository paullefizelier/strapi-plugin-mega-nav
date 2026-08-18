/**
 * Plain React — no framework, no UI library, Tailwind classes for layout only.
 * Presentation-driven: `simple` renders a list, `columns` a grouped panel with
 * a promo. Add a case per layout you use; the rest fall back to `simple`.
 *
 * Items come in as a prop: fetch them on the server (see the next/ and nuxt/
 * templates) so the API token never reaches the browser.
 */
import * as React from "react";
import {
  effectiveLayout,
  image,
  linkProps,
  text,
  type NavItem,
} from "../mega-nav";

/** An item as a link, or as a heading when it has no target. */
function ItemLink({
  item,
  className,
  children,
}: {
  item: NavItem;
  className?: string;
  children?: React.ReactNode;
}) {
  const props = linkProps(item);
  const content = children ?? item.title;
  return props ? (
    <a {...props} className={className}>
      {content}
    </a>
  ) : (
    <span className={className}>{content}</span>
  );
}

/** Title + optional description, both inside the link so the whole block clicks. */
function LinkWithDescription({ item }: { item: NavItem }) {
  const description = text(item, "description");
  return (
    <ItemLink item={item} className="group/link block text-sm hover:underline">
      <span className="block font-medium">{item.title}</span>
      {description ? (
        <span className="mt-0.5 block text-xs opacity-60">{description}</span>
      ) : null}
    </ItemLink>
  );
}

function PromoPanel({ item }: { item: NavItem }) {
  const visual = image(item);
  const headline = text(item, "description");
  const cta = text(item, "ctaLabel");
  const ctaUrl = text(item, "ctaUrl");
  if (!visual && !headline && !cta) return null;

  return (
    <aside className="w-56 shrink-0 rounded-xl bg-black/5 p-4">
      {visual ? (
        <img
          src={visual.url}
          alt={visual.alternativeText ?? ""}
          width={visual.width}
          height={visual.height}
          className="mb-3 h-24 w-full rounded-lg object-cover"
        />
      ) : null}
      {headline ? <p className="font-semibold">{headline}</p> : null}
      {text(item, "tagline") ? (
        <p className="mt-1 text-sm opacity-70">{text(item, "tagline")}</p>
      ) : null}
      {cta && ctaUrl ? (
        <a href={ctaUrl} className="mt-3 inline-block text-sm font-semibold underline">
          {cta}
        </a>
      ) : null}
    </aside>
  );
}

function SimplePanel({ item }: { item: NavItem }) {
  return (
    <ul className="min-w-48 space-y-2 p-4">
      {item.children.map((child) => (
        <li key={child.id}>
          <ItemLink item={child} className="text-sm hover:underline" />
        </li>
      ))}
    </ul>
  );
}

/** Level 2 = groups, level 3 = links (each with an optional description). */
function ColumnsPanel({ item }: { item: NavItem }) {
  return (
    <div className="flex gap-8 p-6">
      <div className="grid flex-1 grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
        {item.children.map((group) => (
          <div key={group.id} className={group.fields.highlight === true ? "rounded-lg ring-1 ring-current/20 p-3" : undefined}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
              {group.title}
            </p>
            {text(group, "description") ? (
              <p className="mb-2 text-xs opacity-60">{text(group, "description")}</p>
            ) : null}
            <ul className="space-y-2">
              {group.children.map((link) => (
                <li key={link.id}>
                  <LinkWithDescription item={link} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <PromoPanel item={item} />
    </div>
  );
}

const PANELS: Record<string, React.ComponentType<{ item: NavItem }>> = {
  simple: SimplePanel,
  columns: ColumnsPanel,
  // split / banner share the grouped shape — reuse ColumnsPanel or write your own.
  split: ColumnsPanel,
  banner: ColumnsPanel,
};

/** One top-level entry: a button that reveals its panel, or a bare link. */
function TopLevelItem({ item }: { item: NavItem }) {
  const [open, setOpen] = React.useState(false);
  const Panel = PANELS[effectiveLayout(item)] ?? SimplePanel;

  if (!item.children.length) {
    return <ItemLink item={item} className="px-3 py-2 text-sm font-medium" />;
  }

  return (
    <li
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 text-sm font-medium"
      >
        {item.title}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 rounded-xl border bg-white shadow-xl">
          <Panel item={item} />
        </div>
      ) : null}
    </li>
  );
}

export function MegaNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Main">
      <ul className="flex items-center gap-1">
        {items.map((item) => (
          <TopLevelItem key={item.id} item={item} />
        ))}
      </ul>
    </nav>
  );
}

export default MegaNav;
