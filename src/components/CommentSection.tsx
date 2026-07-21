import { getFormatter, getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import type { CommentItem } from "@/db/queries/comments";
import { deleteCommentAction } from "@/app/[locale]/products/[slug]/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { CommentForm } from "./CommentForm";
import { CommentDeleteButton } from "./PendingButton";

async function Comment({
  comment,
  canDelete,
  slug,
  children,
}: {
  comment: CommentItem;
  canDelete: boolean;
  slug: string;
  children?: React.ReactNode;
}) {
  const t = await getTranslations("comments");
  const format = await getFormatter();
  return (
    <div className="flex gap-3">
      <Avatar className="size-10 shrink-0">
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
              <input type="hidden" name="slug" value={slug} />
              <CommentDeleteButton label={t("delete")} />
            </form>
          )}
        </div>
        {comment.isDeleted ? (
          <p className="text-sm italic text-muted-foreground/70">
            {t("deleted")}
          </p>
        ) : (
          <div className="prose max-w-none dark:prose-invert">
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
      <h2 className="mt-8 font-heading text-xl font-bold">
        {t("title", { count: comments.filter((c) => !c.isDeleted).length })}
      </h2>

      <div className="mt-4">
        {isAuthenticated ? (
          <CommentForm productId={productId} slug={slug} />
        ) : (
          <p className="rounded-lg border border-dashed bg-muted/50 p-5 text-base text-muted-foreground">
            {t("signInToComment")}
          </p>
        )}
      </div>

      {topLevel.length === 0 && (
        <p className="mt-6 text-base text-muted-foreground">{t("empty")}</p>
      )}

      <div className="mt-8 flex flex-col gap-7">
        {topLevel.map((c) => (
          <Comment key={c.id} comment={c} canDelete={canDelete(c)} slug={slug}>
            <div className="mt-3 flex flex-col gap-4 border-l-2 border-border/70 pl-4">
              {repliesFor(c.id).map((r) => (
                <Comment
                  key={r.id}
                  comment={r}
                  canDelete={canDelete(r)}
                  slug={slug}
                />
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
