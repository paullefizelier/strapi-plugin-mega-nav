<script setup lang="ts">
/**
 * Nuxt — the header component. Put this in `components/MegaNav.vue` and use it
 * as `<MegaNav slug="main-navigation" />`.
 *
 * It reads the server route from the sibling template, so the token never
 * reaches the browser. The slug and locale are reactive: switching language
 * refetches.
 */
import {
  effectiveLayout,
  image,
  linkProps,
  text,
  type NavItem,
} from "../mega-nav";

const props = withDefaults(defineProps<{ slug?: string }>(), {
  slug: "main-navigation",
});

const { locale } = useI18n?.() ?? { locale: ref(undefined) };

const { data: items } = await useFetch<NavItem[]>(
  () => `/api/navigation/${props.slug}`,
  { query: { locale }, default: () => [] },
);

const open = ref<string | null>(null);
</script>

<template>
  <nav aria-label="Main">
    <ul class="flex items-center gap-1">
      <li
        v-for="item in items"
        :key="item.id"
        class="relative"
        @mouseenter="open = item.id"
        @mouseleave="open = null"
      >
        <!-- No children: a plain link (or a heading when it has no target). -->
        <component
          v-if="!item.children.length"
          :is="linkProps(item) ? 'a' : 'span'"
          v-bind="linkProps(item) ?? {}"
          class="px-3 py-2 text-sm font-medium"
        >
          {{ item.title }}
        </component>

        <template v-else>
          <button
            type="button"
            :aria-expanded="open === item.id"
            class="px-3 py-2 text-sm font-medium"
            @click="open = open === item.id ? null : item.id"
          >
            {{ item.title }}
          </button>

          <div
            v-if="open === item.id"
            class="absolute left-0 top-full z-50 rounded-xl border bg-white shadow-xl"
          >
            <!-- Grouped layouts: level 2 = groups, level 3 = links. -->
            <div
              v-if="['columns', 'split', 'banner'].includes(effectiveLayout(item))"
              class="flex gap-8 p-6"
            >
              <div class="grid flex-1 grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4">
                <div
                  v-for="group in item.children"
                  :key="group.id"
                  :class="group.fields.highlight === true && 'rounded-lg p-3 ring-1 ring-current/20'"
                >
                  <p class="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">
                    {{ group.title }}
                  </p>
                  <ul class="space-y-2">
                    <li
                      v-for="link in group.children"
                      :key="link.id"
                    >
                      <!-- Description inside the link: the whole block clicks. -->
                      <component
                        :is="linkProps(link) ? 'a' : 'span'"
                        v-bind="linkProps(link) ?? {}"
                        class="block text-sm hover:underline"
                      >
                        <span class="block font-medium">{{ link.title }}</span>
                        <span
                          v-if="text(link, 'description')"
                          class="mt-0.5 block text-xs opacity-60"
                        >
                          {{ text(link, 'description') }}
                        </span>
                      </component>
                    </li>
                  </ul>
                </div>
              </div>

              <aside
                v-if="image(item) || text(item, 'description')"
                class="w-56 shrink-0 rounded-xl bg-black/5 p-4"
              >
                <img
                  v-if="image(item)"
                  :src="image(item)!.url"
                  :alt="image(item)!.alternativeText ?? ''"
                  class="mb-3 h-24 w-full rounded-lg object-cover"
                >
                <p
                  v-if="text(item, 'description')"
                  class="font-semibold"
                >
                  {{ text(item, 'description') }}
                </p>
                <a
                  v-if="text(item, 'ctaLabel') && text(item, 'ctaUrl')"
                  :href="text(item, 'ctaUrl')"
                  class="mt-3 inline-block text-sm font-semibold underline"
                >
                  {{ text(item, 'ctaLabel') }}
                </a>
              </aside>
            </div>

            <!-- Everything else: a flat list. -->
            <ul
              v-else
              class="min-w-48 space-y-2 p-4"
            >
              <li
                v-for="child in item.children"
                :key="child.id"
              >
                <component
                  :is="linkProps(child) ? 'a' : 'span'"
                  v-bind="linkProps(child) ?? {}"
                  class="text-sm hover:underline"
                >
                  {{ child.title }}
                </component>
              </li>
            </ul>
          </div>
        </template>
      </li>
    </ul>
  </nav>
</template>
