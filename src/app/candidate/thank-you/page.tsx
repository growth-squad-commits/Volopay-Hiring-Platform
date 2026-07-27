import Link from "next/link";
import { Brand } from "@/components/brand";

export default function ThankYouPage() {
  return <main className="thank-you"><Brand/><section><span>✓</span><em className="eyebrow">Submission complete</em><h1>Thank you for completing the assessment</h1><p>We appreciate the time and effort you put into your answers. The Volopay hiring team will review your submission and contact you regarding the next steps.</p><Link className="button primary" href="/candidate">Back to assessments</Link></section></main>;
}
