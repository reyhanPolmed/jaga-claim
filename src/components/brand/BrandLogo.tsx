import Image from "next/image";
import logo from "../../../logo jaga claim.png";

export function BrandLogo({ className = "h-10 w-10" }: { className?: string }) {
  return <Image src={logo} alt="Logo JAGA-CLAIM" width={48} height={48} priority className={`shrink-0 rounded-xl object-cover ${className}`} />;
}
