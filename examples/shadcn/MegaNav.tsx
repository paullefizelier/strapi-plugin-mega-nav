"use client";

/**
 * shadcn/ui — built on the NavigationMenu component, which brings the keyboard
 * navigation, focus management and ARIA wiring for free (it wraps Radix's
 * primitive).
 *
 * ```bash
 * npx shadcn@latest add navigation-menu
 * ```
 *
 * Items come in as a prop; fetch them in a server component (see the next/
 * template) so the token stays on the server.
 */
import * as React from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";
import {
  effectiveLayout,
  image,
  linkProps,
  text,
  type NavItem,
} from "../mega-nav";

/**
 * `asChild` hands NavigationMenuLink's behaviour to our own anchor — that is the
 * documented way to keep the menu's keyboard and focus semantics while
 * controlling the markup. Swap `<a>` for `next/link` if you prefer.
 */
function MenuLink({
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

  if (!props) {
    return <span className={cn("block", className)}>{content}</span>;
  }
  return (
    <NavigationMenuLink asChild>
      <a
        {...props}
        className={cn(
          "block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent",
          className,
        )}
      >
        {content}
      </a>
    </NavigationMenuLink>
  );
}

function LinkWithDescription({ item }: { item: NavItem }) {
  const description = text(item, "description");
  return (
    <MenuLink item={item}>
      <span className="text-sm font-medium">{item.title}</span>
      {description ? (
        <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">
          {description}
        </span>
      ) : null}
    </MenuLink>
  );
}

function SimplePanel({ item }: { item: NavItem }) {
  return (
    <ul className="grid w-[320px] gap-1 p-3">
      {item.children.map((child) => (
        <li key={child.id}>
          <LinkWithDescription item={child} />
        </li>
      ))}
    </ul>
  );
}

function ColumnsPanel({ item }: { item: NavItem }) {
  const visual = image(item);
  const headline = text(item, "description");

  return (
    <div className="flex w-[860px] gap-6 p-5">
      <div className="grid flex-1 grid-cols-3 gap-x-6 gap-y-5">
        {item.children.map((group) => (
          <div
            key={group.id}
            className={cn(
              "rounded-lg",
              group.fields.highlight === true && "bg-accent/40 p-3 ring-1 ring-border",
            )}
          >
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.title}
            </p>
            <ul className="space-y-1">
              {group.children.map((link) => (
                <li key={link.id}>
                  <LinkWithDescription item={link} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {visual || headline ? (
        <aside className="w-60 shrink-0 rounded-lg bg-muted p-4">
          {visual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={visual.url}
              alt={visual.alternativeText ?? ""}
              className="mb-3 h-28 w-full rounded-md object-cover"
            />
          ) : null}
          {headline ? <p className="font-semibold leading-snug">{headline}</p> : null}
          {text(item, "tagline") ? (
            <p className="mt-1 text-sm text-muted-foreground">{text(item, "tagline")}</p>
          ) : null}
          {text(item, "ctaLabel") && text(item, "ctaUrl") ? (
            <a
              href={text(item, "ctaUrl")}
              className="mt-3 inline-block text-sm font-semibold underline"
            >
              {text(item, "ctaLabel")}
            </a>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

const PANELS: Record<string, React.ComponentType<{ item: NavItem }>> = {
  simple: SimplePanel,
  columns: ColumnsPanel,
  split: ColumnsPanel,
  banner: ColumnsPanel,
};

export function MegaNav({ items }: { items: NavItem[] }) {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        {items.map((item) => {
          const Panel = PANELS[effectiveLayout(item)] ?? SimplePanel;
          return (
            <NavigationMenuItem key={item.id}>
              {item.children.length ? (
                <>
                  <NavigationMenuTrigger>{item.title}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <Panel item={item} />
                  </NavigationMenuContent>
                </>
              ) : (
                <MenuLink item={item} className="px-4 py-2 text-sm font-medium" />
              )}
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}

export default MegaNav;
