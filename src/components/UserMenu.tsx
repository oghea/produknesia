"use client";

import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export function UserMenu({
  name,
  image,
  username,
  isAdmin,
  signOutAction,
}: {
  name: string | null;
  image: string | null;
  username: string | null;
  isAdmin: boolean;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations("nav");
  const initial = (name ?? "?").charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer rounded-full"
            aria-label={name ?? t("profile")}
          />
        }
      >
        <Avatar className="size-8">
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {username && (
          <DropdownMenuItem
            className="cursor-pointer"
            render={<Link href={`/u/${username}`} />}
          >
            <UserRound className="size-4" />
            {t("profile")}
          </DropdownMenuItem>
        )}
        {isAdmin && (
          <DropdownMenuItem
            className="cursor-pointer"
            render={<Link href="/admin" />}
          >
            <ShieldCheck className="size-4" />
            {t("admin")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem
            closeOnClick={false}
            className="w-full cursor-pointer"
            render={<button type="submit" />}
          >
            <LogOut className="size-4" />
            {t("signOut")}
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
