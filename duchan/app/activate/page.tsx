import type { Metadata } from "next";
import { ACTIVATION_PRICE, DEAL_LABEL, FULL_PRICE, IS_LAUNCH, OWNER_WHATSAPP, PAY_BIT_URL, PAY_PAYBOX_URL } from "@/lib/pricing";
import ActivateView from "./activate-view";

export const metadata: Metadata = {
  title: "פרסום החנות",
  robots: { index: false, follow: false },
};

// מסך ההפעלה. הרגע היחיד שבו מדברים על כסף — אחרי שהחנות כבר בנויה.

export default function ActivatePage() {
  return (
    <ActivateView
      price={ACTIVATION_PRICE}
      fullPrice={FULL_PRICE}
      isLaunch={IS_LAUNCH}
      dealLabel={DEAL_LABEL}
      bitUrl={PAY_BIT_URL}
      payboxUrl={PAY_PAYBOX_URL}
      ownerWhatsapp={OWNER_WHATSAPP}
    />
  );
}
