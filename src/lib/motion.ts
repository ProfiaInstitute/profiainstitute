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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window) || !("animate" in HTMLElement.prototype)) return;

    const selector = includeGenericElements
      ? "[data-scroll-reveal], section, article"
      : "[data-scroll-reveal]";
    const reveal = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target as HTMLElement;
          const animation = target.animate(
            [
              { opacity: 0, transform: "translate3d(0, 28px, 0) scale(.985)" },
              { opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
            ],
            {
              duration: 520,
              delay: Math.min(delays.get(target) ?? 0, 5) * 55,
              easing: "cubic-bezier(.2, .72, .2, 1)",
            },
          );
          animation.onfinish = () => animation.cancel();
          reveal.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -36px 0px" },
    );
    const observed = new WeakSet<Element>();
    const delays = new WeakMap<Element, number>();
    const observeTarget = (element: HTMLElement, index: number) => {
      if (observed.has(element)) return;
      observed.add(element);
      delays.set(element, index);
      reveal.observe(element);
    };
    const observeTargets = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(selector).forEach(observeTarget);
    };

    observeTargets(container);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches(selector)) observeTarget(node, 0);
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
