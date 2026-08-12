import * as React from "react";
import { useIntl } from "react-intl";
import styled from "styled-components";
import { Box, Flex, Typography } from "@strapi/design-system";
import { isGroupedLayout } from "../editor/lint";
import { getTranslation } from "../getTranslation";
import type { LayoutSpec, NavNode } from "../types";

/**
 * Schematic wireframe of the mega-menu — labeled as such. It renders the REAL
 * content (titles, uploaded images, CTAs) inside approximate geometry, and its
 * one pixel-true behavior is the degradation decision: a grouped layout on a
 * flat tree renders as `simple` here because that is what the site will do.
 * Empty zones show a dashed placeholder naming the missing field; clicking
 * anything selects the item in the tree.
 */

const Chrome = styled.div`
  background: #14141e;
  border-radius: 12px;
  padding: 20px;
  color: #f5f5fa;
  min-height: 180px;
`;

const Clickable = styled.div<{ $selected?: boolean }>`
  cursor: pointer;
  border-radius: 8px;
  outline: ${({ $selected }) => ($selected ? "2px solid #7b79ff" : "none")};
  &:hover {
    outline: 2px solid rgba(123, 121, 255, 0.55);
  }
`;

const Placeholder = styled.div`
  border: 1px dashed rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  text-align: center;
`;

const Img = styled.img`
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 6px;
  display: block;
`;

const Muted = styled.span`
  color: rgba(255, 255, 255, 0.55);
  font-size: 1.15rem;
`;

const Title = styled.span<{ $bold?: boolean }>`
  color: #fff;
  font-size: 1.25rem;
  font-weight: ${({ $bold }) => ($bold ? 600 : 500)};
`;

const Cta = styled.span`
  display: inline-block;
  background: rgba(123, 121, 255, 0.25);
  border: 1px solid rgba(123, 121, 255, 0.6);
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 1.1rem;
  color: #d6d5ff;
`;

const IconDot = styled.span`
  width: 16px;
  height: 16px;
  border-radius: 4px;
  background: rgba(123, 121, 255, 0.5);
  flex-shrink: 0;
  display: inline-block;
`;

interface Ctx {
  selectedId: string | null;
  onSelect: (id: string) => void;
  t: (id: string, defaultMessage: string, values?: Record<string, string | number>) => string;
}

const mediaUrl = (node: NavNode, field = "image"): string | null => {
  const value = node.fields[field];
  if (value && typeof value === "object" && "media" in value) return value.media.url ?? null;
  return null;
};

const str = (node: NavNode, field: string): string | null => {
  const value = node.fields[field];
  return typeof value === "string" && value ? value : null;
};

const ImageZone = ({ node, ctx, height = 90, label }: { node: NavNode; ctx: Ctx; height?: number; label: string }) => {
  const url = mediaUrl(node);
  return url ? (
    <div style={{ height }}>
      <Img src={url} alt="" />
    </div>
  ) : (
    <Placeholder style={{ height }}>{label}</Placeholder>
  );
};

const PromoPanel = ({ node, ctx, banner = false }: { node: NavNode; ctx: Ctx; banner?: boolean }) => (
  <Clickable
    $selected={ctx.selectedId === node.id}
    onClick={(e) => {
      e.stopPropagation();
      ctx.onSelect(node.id);
    }}
    style={{ padding: 10, background: "rgba(255,255,255,0.04)", flex: banner ? undefined : "0 0 220px" }}
  >
    <Flex direction={banner ? "row" : "column"} gap={2} alignItems={banner ? "center" : "stretch"}>
      <div style={{ flex: banner ? "0 0 160px" : undefined }}>
        <ImageZone node={node} ctx={ctx} height={banner ? 60 : 90} label={ctx.t("preview.zone-image", "promo image")} />
      </div>
      <Flex direction="column" gap={1} alignItems="flex-start">
        {str(node, "description") ? (
          <Title $bold>{str(node, "description")}</Title>
        ) : (
          <Placeholder style={{ width: "100%" }}>{ctx.t("preview.zone-promo-title", "description = promo title")}</Placeholder>
        )}
        {str(node, "tagline") ? <Muted>{str(node, "tagline")}</Muted> : null}
        {str(node, "ctaLabel") ? <Cta>{str(node, "ctaLabel")}</Cta> : null}
      </Flex>
    </Flex>
  </Clickable>
);

const LinkRow = ({ node, ctx, withDescription = false, withIcon = true }: { node: NavNode; ctx: Ctx; withDescription?: boolean; withIcon?: boolean }) => (
  <Clickable
    $selected={ctx.selectedId === node.id}
    onClick={(e) => {
      e.stopPropagation();
      ctx.onSelect(node.id);
    }}
    style={{ padding: "6px 8px" }}
  >
    <Flex gap={2} alignItems="center">
      {withIcon && str(node, "icon") ? <IconDot /> : null}
      <Flex direction="column" alignItems="flex-start" style={{ minWidth: 0 }}>
        <Title>{node.title}</Title>
        {withDescription && str(node, "description") ? <Muted>{str(node, "description")}</Muted> : null}
      </Flex>
    </Flex>
  </Clickable>
);

/* ----------------------------------- templates ----------------------------------- */

const LinkList = ({ root, ctx }: { root: NavNode; ctx: Ctx }) => (
  <Flex direction="column" alignItems="stretch" gap={1} style={{ maxWidth: 320 }}>
    {root.children.map((child) => (
      <LinkRow key={child.id} node={child} ctx={ctx} />
    ))}
  </Flex>
);

const RowList = ({ root, ctx }: { root: NavNode; ctx: Ctx }) => {
  const imageStart = str(root, "imagePosition") === "start";
  const promo = <PromoPanel node={root} ctx={ctx} />;
  return (
    <Flex gap={4} alignItems="flex-start">
      {imageStart ? promo : null}
      <Flex direction="column" alignItems="stretch" gap={1} style={{ flex: 1 }}>
        {root.children.map((child) => (
          <LinkRow key={child.id} node={child} ctx={ctx} withDescription />
        ))}
      </Flex>
      {!imageStart ? promo : null}
    </Flex>
  );
};

const CardGrid = ({ root, ctx }: { root: NavNode; ctx: Ctx }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
    {root.children.map((child) => (
      <Clickable
        key={child.id}
        $selected={ctx.selectedId === child.id}
        onClick={(e) => {
          e.stopPropagation();
          ctx.onSelect(child.id);
        }}
        style={{ padding: 8, background: "rgba(255,255,255,0.04)" }}
      >
        <Flex direction="column" alignItems="stretch" gap={1}>
          <ImageZone node={child} ctx={ctx} height={56} label={ctx.t("preview.zone-card-image", "image / icon")} />
          <Title>{child.title}</Title>
          {str(child, "description") ? <Muted>{str(child, "description")}</Muted> : null}
        </Flex>
      </Clickable>
    ))}
  </div>
);

const Mosaic = ({ root, ctx }: { root: NavNode; ctx: Ctx }) => {
  const [hero, ...rest] = root.children;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: 64, gap: 8 }}>
      {hero ? (
        <Clickable
          $selected={ctx.selectedId === hero.id}
          onClick={(e) => {
            e.stopPropagation();
            ctx.onSelect(hero.id);
          }}
          style={{ gridColumn: "span 2", gridRow: "span 2", position: "relative", overflow: "hidden", background: "rgba(255,255,255,0.05)" }}
        >
          {mediaUrl(hero) ? <Img src={mediaUrl(hero)!} alt="" /> : <Placeholder style={{ height: "100%" }}>{ctx.t("preview.zone-hero", "hero tile — image")}</Placeholder>}
          <div style={{ position: "absolute", left: 8, bottom: 8 }}>
            <Title $bold>{hero.title}</Title>
            {str(hero, "description") ? (
              <div>
                <Muted>{str(hero, "description")}</Muted>
              </div>
            ) : null}
          </div>
        </Clickable>
      ) : null}
      {rest.map((child) => (
        <Clickable
          key={child.id}
          $selected={ctx.selectedId === child.id}
          onClick={(e) => {
            e.stopPropagation();
            ctx.onSelect(child.id);
          }}
          style={{ position: "relative", overflow: "hidden", background: "rgba(255,255,255,0.05)" }}
        >
          {mediaUrl(child) ? <Img src={mediaUrl(child)!} alt="" /> : null}
          <div style={{ position: "absolute", left: 6, bottom: 6 }}>
            <Title>{child.title}</Title>
          </div>
        </Clickable>
      ))}
    </div>
  );
};

const GroupColumn = ({ group, ctx }: { group: NavNode; ctx: Ctx }) => (
  <Clickable
    $selected={ctx.selectedId === group.id}
    onClick={(e) => {
      e.stopPropagation();
      ctx.onSelect(group.id);
    }}
    style={{
      padding: 8,
      background: group.fields.highlight === true ? "rgba(123,121,255,0.12)" : "transparent",
      border: group.fields.highlight === true ? "1px solid rgba(123,121,255,0.5)" : "1px solid transparent",
      flex: 1,
      minWidth: 130,
    }}
  >
    <Flex direction="column" alignItems="stretch" gap={1}>
      <Typography variant="sigma" style={{ color: "rgba(255,255,255,0.5)" }}>
        {group.title}
      </Typography>
      {str(group, "description") ? <Muted>{str(group, "description")}</Muted> : null}
      {group.children.map((link) => (
        <LinkRow key={link.id} node={link} ctx={ctx} withIcon={false} />
      ))}
      {str(group, "ctaLabel") ? <Cta>{str(group, "ctaLabel")}</Cta> : null}
    </Flex>
  </Clickable>
);

const LinksPromo = ({ root, ctx, params }: { root: NavNode; ctx: Ctx; params: Record<string, unknown> }) => {
  const grouped = Boolean(params.grouped);
  const promo = String(params.promo ?? "right");
  const [hovered, setHovered] = React.useState<NavNode | null>(null);

  const links = grouped ? (
    <Flex gap={2} alignItems="flex-start" style={{ flex: 1 }}>
      {root.children.map((group) => (
        <GroupColumn key={group.id} group={group} ctx={ctx} />
      ))}
    </Flex>
  ) : (
    <Flex direction="column" alignItems="stretch" gap={1} style={{ flex: 1 }}>
      {root.children.map((child) => (
        <div key={child.id} onMouseEnter={() => setHovered(child)}>
          <LinkRow node={child} ctx={ctx} withDescription />
        </div>
      ))}
    </Flex>
  );

  if (promo === "bottom-banner") {
    return (
      <Flex direction="column" alignItems="stretch" gap={3}>
        {links}
        <PromoPanel node={root} ctx={ctx} banner />
      </Flex>
    );
  }
  if (promo === "left-split") {
    return (
      <Flex gap={4} alignItems="stretch">
        <div style={{ flex: "0 0 45%" }}>
          <PromoPanel node={root} ctx={ctx} />
        </div>
        {links}
      </Flex>
    );
  }
  if (promo === "hover") {
    const active = hovered ?? root;
    return (
      <Flex gap={4} alignItems="flex-start">
        {links}
        <div style={{ flex: "0 0 220px" }}>
          <ImageZone node={active} ctx={ctx} height={130} label={ctx.t("preview.zone-hover", "image follows the hovered link")} />
          {str(root, "tagline") ? <Muted>{str(root, "tagline")}</Muted> : null}
        </div>
      </Flex>
    );
  }
  // right (featured / columns)
  return (
    <Flex gap={4} alignItems="flex-start">
      {links}
      <PromoPanel node={root} ctx={ctx} />
    </Flex>
  );
};

const TabsDetail = ({ root, ctx }: { root: NavNode; ctx: Ctx }) => {
  const [activeId, setActiveId] = React.useState<string | null>(root.children[0]?.id ?? null);
  const active = root.children.find((c) => c.id === activeId) ?? root.children[0];
  return (
    <Flex direction="column" alignItems="stretch" gap={3}>
      <Flex gap={4} alignItems="flex-start">
        <div style={{ flex: "0 0 200px" }}>
          <PromoPanel node={active ?? root} ctx={ctx} />
        </div>
        <Flex direction="column" alignItems="stretch" gap={1} style={{ flex: "0 0 180px" }}>
          {root.children.map((team) => (
            <div key={team.id} onMouseEnter={() => setActiveId(team.id)}>
              <Clickable
                $selected={ctx.selectedId === team.id}
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onSelect(team.id);
                }}
                style={{ padding: "6px 8px", background: team.id === active?.id ? "rgba(255,255,255,0.07)" : "transparent" }}
              >
                <Title>{team.title}</Title>
                {str(team, "offerBrand") ? <Muted> · {str(team, "offerBrand")}</Muted> : null}
              </Clickable>
            </div>
          ))}
        </Flex>
        <Flex gap={2} alignItems="flex-start" style={{ flex: 1 }}>
          {(active?.children ?? []).map((group) => (
            <GroupColumn key={group.id} group={group} ctx={ctx} />
          ))}
        </Flex>
      </Flex>
      {str(root, "ctaLabel") ? (
        <Flex justifyContent="center">
          <Cta>{str(root, "ctaLabel")}</Cta>
        </Flex>
      ) : (
        <Placeholder>{ctx.t("preview.zone-footer-cta", "footer CTA (label + url)")}</Placeholder>
      )}
    </Flex>
  );
};

/* ----------------------------------- shell ----------------------------------- */

const TEMPLATES: Record<string, React.ComponentType<{ root: NavNode; ctx: Ctx; params: Record<string, unknown> }>> = {
  linkList: ({ root, ctx }) => <LinkList root={root} ctx={ctx} />,
  rowList: ({ root, ctx }) => <RowList root={root} ctx={ctx} />,
  cardGrid: ({ root, ctx }) => <CardGrid root={root} ctx={ctx} />,
  mosaic: ({ root, ctx }) => <Mosaic root={root} ctx={ctx} />,
  linksPromo: LinksPromo,
  tabsDetail: ({ root, ctx }) => <TabsDetail root={root} ctx={ctx} />,
};

interface PreviewProps {
  root: NavNode;
  spec: LayoutSpec | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const Preview = ({ root, spec, selectedId, onSelect }: PreviewProps) => {
  const { formatMessage } = useIntl();
  const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
    formatMessage({ id: getTranslation(id), defaultMessage }, values);
  const ctx: Ctx = { selectedId, onSelect, t };

  // The one behavior that must be pixel-true: the front's fallback decision.
  const flat = !root.children.some((child) => child.children.length > 0);
  const degrades = spec ? isGroupedLayout(spec) && flat : false;
  const effective = degrades || !spec ? { template: flat ? "linkList" : "linksPromo", params: flat ? {} : { grouped: true, promo: "right" } } : spec.preview;
  const Template = TEMPLATES[effective.template] ?? TEMPLATES.linkList;

  return (
    <Flex direction="column" alignItems="stretch" gap={2}>
      <Flex gap={2} alignItems="center">
        <Typography variant="sigma" textColor="neutral600">
          {t("preview.label", "Schematic preview")}
        </Typography>
        <Typography variant="pi" textColor="neutral500">
          {spec ? spec.label : t("preview.no-layout", "no layout — structural fallback")}
        </Typography>
      </Flex>
      {degrades && spec ? (
        <Box padding={3} background="danger100" hasRadius>
          <Typography variant="pi" textColor="danger700">
            {t(
              "preview.degrades",
              "This menu will render as “simple”: “{layout}” needs groups with children at level 2.",
              { layout: spec.label },
            )}
          </Typography>
        </Box>
      ) : null}
      <Chrome>
        {root.children.length ? (
          <Template root={root} ctx={ctx} params={effective.params} />
        ) : (
          <Placeholder style={{ height: 120 }}>{t("preview.empty", "Add children to this menu item to see the panel")}</Placeholder>
        )}
      </Chrome>
    </Flex>
  );
};

export default Preview;
