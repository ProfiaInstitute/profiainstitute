import { createFileRoute } from "@tanstack/react-router";
import { ArticleDetailPage, type PublicArticle } from "@/components/site/PublicPages";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/site";

export const Route = createFileRoute("/articles/$slug")({
  loader: async ({ params }): Promise<PublicArticle | null> => {
    const { data, error } = await supabase
      .from("articles")
      .select(
        "slug,title,excerpt,content,featured_image,attachment_url,attachment_type,author,published_at",
      )
      .eq("slug", params.slug)
      .or(
        `status.eq.published,and(status.eq.scheduled,published_at.lte.${new Date().toISOString()})`,
      )
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  head: ({ loaderData, params }) => {
    const article = loaderData;
    return seo(
      article?.title ? `${article.title} — Profia Institute` : "Institute News — Profia Institute",
      article?.excerpt ||
        `Read news, updates and stories from Profia Institute in Homa Bay. Article: ${params.slug.replaceAll("-", " ")}.`,
      `/articles/${encodeURIComponent(params.slug)}`,
      article?.featured_image ?? undefined,
    );
  },
  component: ArticleRoute,
});

function ArticleRoute() {
  const article = Route.useLoaderData();
  return <ArticleDetailPage article={article} />;
}
