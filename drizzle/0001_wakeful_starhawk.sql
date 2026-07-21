CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"draft" jsonb NOT NULL,
	"note" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_by" text,
	"claimed_product_id" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "product_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"author_id" text NOT NULL,
	"version" text,
	"title_id" text,
	"title_en" text,
	"body_id" text,
	"body_en" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_watches" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"user_id" text NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_watches_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);
--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_claimed_product_id_products_id_fk" FOREIGN KEY ("claimed_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_updates" ADD CONSTRAINT "product_updates_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_updates" ADD CONSTRAINT "product_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_watches" ADD CONSTRAINT "product_watches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_watches" ADD CONSTRAINT "product_watches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_updates_product_status_idx" ON "product_updates" USING btree ("product_id","status","published_at");--> statement-breakpoint
CREATE INDEX "product_updates_status_idx" ON "product_updates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "watches_user_product_uniq" ON "product_watches" USING btree ("product_id","user_id");--> statement-breakpoint
CREATE INDEX "watches_user_idx" ON "product_watches" USING btree ("user_id");