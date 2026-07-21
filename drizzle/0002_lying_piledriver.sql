CREATE TABLE "launch_subscribers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "launch_subscribers_email_unique" UNIQUE("email")
);
