import { useEffect, type RefObject } from "react";

export function useScrollReveal(
  containerRef: RefObject<HTMLElement | null>,
  refreshKey?: string,
  includeGenericElements = true,
  enabled = true,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const selector = includeGenericElements
      ? "[data-scroll-reveal], section, article"
      : "[data-scroll-reveal]";
    const markVisible = (root: ParentNode) => {
      root
        .querySelectorAll<HTMLElement>(selector)
        .forEach((element) => element.classList.add("is-visible"));
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      markVisible(container);
      const mutations = new MutationObserver((records) => {
        records.forEach((record) =>
          record.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              if (node.matches(selector)) node.classList.add("is-visible");
              markVisible(node);
            }
          }),
        );
      });
      mutations.observe(container, { childList: true, subtree: true });
      return () => mutations.disconnect();
    }
    if (!("IntersectionObserver" in window)) {
      markVisible(container);
      return;
    }

    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          reveal.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -36px 0px" },
    );
    const observed = new WeakSet<Element>();
    const observeTargets = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        reveal.observe(element);
      });
    };

    document.documentElement.classList.add("motion-ready");
    observeTargets(container);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (
              !observed.has(node) &&
              (node.matches("[data-scroll-reveal]") ||
                (includeGenericElements && node.matches("section, article")))
            ) {
              observed.add(node);
              reveal.observe(node);
            }
            observeTargets(node);
          }
        });
      });
    });
    mutations.observe(container, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      reveal.disconnect();
    };
  }, [containerRef, refreshKey, includeGenericElements, enabled]);
}
