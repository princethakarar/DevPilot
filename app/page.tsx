import Image from "next/image";
import { Button } from "@/components/ui/button";
import UserButton from "@/modules/auth/components/user-button";

export default async function Home() {
  return (
    <div className="flex flex-col items-center h-screen justify-center p-24">
      <Button>Get Started</Button>
      <UserButton/>
    </div>
  );
}