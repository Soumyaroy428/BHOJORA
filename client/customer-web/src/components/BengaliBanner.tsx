interface BengaliBannerProps {
  inEnglish: boolean;
  onToggleLanguage: () => void;
}

export function BengaliBanner({ inEnglish, onToggleLanguage }: BengaliBannerProps) {
  return (
    <section className="container">
      <div className="bengali-banner">
        <div>
          <h3 id="bannerTitle" className="bengali-title" lang={inEnglish ? 'en' : 'bn'}>
            {inEnglish
              ? 'Food You Love. Trust You Deserve.'
              : 'খাবার আপনি ভালোবাসেন। বিশ্বাস আপনি প্রাপ্য।'}
          </h3>
          <p id="bannerText" className="bengali-text" lang={inEnglish ? 'en' : 'bn'}>
            {inEnglish
              ? 'Bhojora audits every restaurant and cloud kitchen in Kolkata through independent inspectors — clean kitchens, authentic taste, and safer delivery under one roof.'
              : 'ভোজোরা (Bhojora) কলকাতার প্রতিটি রেস্তোরাঁ ও ক্লাউড কিচেন স্বাধীন পরিদর্শকদের দ্বারা যাচাই করে। পরিষ্কার রান্নাঘর, খাঁটি স্বাদ এবং নিরাপদ ডেলিভারি—এখন একই ছাদের নিচে।'}
          </p>
        </div>
        <button
          type="button"
          id="langToggleBtn"
          className="btn btn-outline"
          style={{
            background: 'var(--cream)',
            color: 'var(--terracotta)',
            border: 'none',
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
          onClick={onToggleLanguage}
        >
          {inEnglish ? 'বাংলা সংস্করণ' : 'Read in English'}
        </button>
      </div>
    </section>
  );
}
