import { getTranslations } from "next-intl/server";
import ReactMarkdown from "react-markdown";
import type { CommentItem } from "@/db/queries/comments";
import { deleteCommentAction } from "@/app/[locale]/products/[slug]/actions";
import { CommentForm } from "./CommentForm";

function Avatar({ name }: { name: string | null }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-sm font-bold text-gray-500">
      {(name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}

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
  return (
    <div className="flex gap-3">
      <Avatar name={comment.authorName} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold">
            {comment.authorName ?? "?"}
          </span>
          <span className="text-xs text-gray-400">
            {comment.createdAt.toLocaleDateString()}
          </span>
          {canDelete && !comment.isDeleted && (
            <form action={deleteCommentAction} className="ml-auto">
              <input type="hidden" name="commentId" value={comment.id} />
              <button
                type="submit"
                className="text-xs text-gray-400 hover:text-red-600"
              >
                {t("delete")}
              </button>
            </form>
          )}
        </div>
        {comment.isDeleted ? (
          <p className="text-sm italic text-gray-400">{t("deleted")}</p>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{comment.body}</ReactMarkdown>
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
    <section className="mt-10 border-t border-gray-200 pt-6">
      <h2 className="text-lg font-bold">
        {t("title", { count: comments.filter((c) => !c.isDeleted).length })}
      </h2>

      <div className="mt-4">
        {isAuthenticated ? (
          <CommentForm productId={productId} slug={slug} />
        ) : (
          <p className="rounded-md bg-gray-50 p-4 text-sm text-gray-500">
            {t("signInToComment")}
          </p>
        )}
      </div>

      {topLevel.length === 0 && (
        <p className="mt-6 text-sm text-gray-500">{t("empty")}</p>
      )}

      <div className="mt-6 flex flex-col gap-6">
        {topLevel.map((c) => (
          <Comment key={c.id} comment={c} canDelete={canDelete(c)}>
            <div className="mt-3 flex flex-col gap-4 border-l-2 border-gray-100 pl-4">
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
