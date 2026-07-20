import { Trash2 } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import type { CommentItem } from "@/db/queries/comments";
import { deleteCommentAction } from "@/app/[locale]/products/[slug]/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { CommentForm } from "./CommentForm";

async function Comment({
  comment,
  canDelete,
  children,
}: {
  comment: CommentItem;
  canDelete: boolean;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("comments");
  const format = await getFormatter();
  return (
    <div className="flex gap-3">
      <Avatar className="size-8 shrink-0">
        <AvatarFallback className="text-sm font-semibold">
          {(comment.authorName ?? "?").charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">
            {comment.authorName ?? "?"}
          </span>
          <span className="text-xs text-muted-foreground/80">
            {format.dateTime(comment.createdAt, { dateStyle: "medium" })}
          </span>
          {canDelete && !comment.isDeleted && (
            <form action={deleteCommentAction} className="ml-auto">
              <input type="hidden" name="commentId" value={comment.id} />
              <button
                type="submit"
                aria-label={t("delete")}
                className="flex cursor-pointer items-center gap-1 rounded-md p-1 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
        {comment.isDeleted ? (
          <p className="text-sm italic text-muted-foreground/70">
            {t("deleted")}
          </p>
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
              components={{
                img: () => null,
                a: ({ href, children }) => (
                  <a
                    href={href}
                    rel="nofollow ugc noopener noreferrer"
                    target="_blank"
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {comment.body}
            </ReactMarkdown>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export async function CommentSection({
  productId,
  slug,
  comments,
  viewerId,
  viewerIsAdmin,
  isAuthenticated,
}: {
  productId: string;
  slug: string;
  comments: CommentItem[];
  viewerId: string | null;
  viewerIsAdmin: boolean;
  isAuthenticated: boolean;
}) {
  const t = await getTranslations("comments");
  const topLevel = comments.filter((c) => c.parentId === null);
  const repliesFor = (id: string) =>
    comments.filter((c) => c.parentId === id);
  const canDelete = (c: CommentItem) =>
    viewerIsAdmin || (viewerId !== null && viewerId === c.authorId);

  return (
    <section className="mt-12">
      <Separator />
      <h2 className="mt-8 font-heading text-lg font-bold">
        {t("title", { count: comments.filter((c) => !c.isDeleted).length })}
      </h2>

      <div className="mt-4">
        {isAuthenticated ? (
          <CommentForm productId={productId} slug={slug} />
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/50 p-4 text-sm text-muted-foreground">
            {t("signInToComment")}
          </p>
        )}
      </div>

      {topLevel.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">{t("empty")}</p>
      )}

      <div className="mt-8 flex flex-col gap-7">
        {topLevel.map((c) => (
          <Comment key={c.id} comment={c} canDelete={canDelete(c)}>
            <div className="mt-3 flex flex-col gap-4 border-l-2 border-border/70 pl-4">
              {repliesFor(c.id).map((r) => (
                <Comment key={r.id} comment={r} canDelete={canDelete(r)} />
              ))}
              {isAuthenticated && !c.isDeleted && (
                <CommentForm productId={productId} slug={slug} parentId={c.id} />
              )}
            </div>
          </Comment>
        ))}
      </div>
    </section>
  );
}
