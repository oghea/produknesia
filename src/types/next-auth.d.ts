import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "admin";
      username: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: "user" | "admin";
    username: string | null;
  }
}
