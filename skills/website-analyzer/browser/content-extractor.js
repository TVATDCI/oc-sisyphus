/**
 * Content Inventory Extractor
 * 
 * Extracts actual content (text, media, metadata) from a live page during browser inspection.
 * Produces structured JSON that downstream pipeline stages (PRD, Plan, Executor) can reference.
 * 
 * Oracle Fix #1: Addresses the root cause of clone failures — missing content inventory.
 */

class ContentExtractor {
  constructor(page) {
    this.page = page;
  }

  /**
   * Main extraction entry point.
   * Returns a structured content inventory object.
   */
  async extract() {
    const inventory = {
      metadata: await this.extractMetadata(),
      navigation: await this.extractNavigation(),
      hero: await this.extractHero(),
      sections: await this.extractSections(),
      projects: await this.extractProjects(),
      footer: await this.extractFooter(),
      interactive: await this.extractInteractive(),
      media: await this.extractMedia(),
      extracted_at: new Date().toISOString()
    };

    return inventory;
  }

  /**
   * Extract page-level metadata (title, meta description, OG tags, lang)
   */
  async extractMetadata() {
    return await this.page.evaluate(() => {
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"]`) ||
                   document.querySelector(`meta[property="${name}"]`) ||
                   document.querySelector(`meta[property="og:${name}"]`);
        return el?.getAttribute('content') || null;
      };

      return {
        title: document.title || null,
        description: getMeta('description') || getMeta('og:description') || null,
        ogTitle: getMeta('og:title') || null,
        ogDescription: getMeta('og:description') || null,
        ogImage: getMeta('og:image') || null,
        ogUrl: getMeta('og:url') || null,
        lang: document.documentElement.lang || null,
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
        favicon: document.querySelector('link[rel="icon"]')?.getAttribute('href') ||
                 document.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') || null
      };
    });
  }

  /**
   * Extract navigation items (labels, hrefs, order, hierarchy)
   */
  async extractNavigation() {
    return await this.page.evaluate(() => {
      const navElements = document.querySelectorAll('nav, [role="navigation"], header nav');
      const navItems = [];

      navElements.forEach((nav, idx) => {
        const links = nav.querySelectorAll('a[href]');
        const items = [];
        links.forEach(link => {
          const text = link.textContent?.trim();
          const href = link.getAttribute('href');
          if (text && href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            items.push({
              label: text,
              href: href,
              ariaLabel: link.getAttribute('aria-label') || null,
              hasIcon: !!link.querySelector('svg, img, [class*="icon"]')
            });
          }
        });

        if (items.length > 0) {
          navItems.push({
            name: nav.getAttribute('aria-label') || `nav-${idx}`,
            items: items
          });
        }
      });

      // Fallback: if no nav elements found, try header
      if (navItems.length === 0) {
        const header = document.querySelector('header');
        if (header) {
          const links = header.querySelectorAll('a[href]');
          const items = [];
          links.forEach(link => {
            const text = link.textContent?.trim();
            const href = link.getAttribute('href');
            if (text && href) {
              items.push({ label: text, href });
            }
          });
          if (items.length > 0) {
            navItems.push({ name: 'header-nav', items });
          }
        }
      }

      return navItems;
    });
  }

  /**
   * Extract hero section content (headline, subheadline, CTA text/links)
   */
  async extractHero() {
    return await this.page.evaluate(() => {
      // Try common hero selectors
      const heroSelectors = [
        'section.hero', '[class*="hero"]', 'header.hero',
        '#hero', '.hero-section', '[data-section="hero"]',
        'main > section:first-child', 'header'
      ];

      let heroEl = null;
      for (const selector of heroSelectors) {
        heroEl = document.querySelector(selector);
        if (heroEl && heroEl.textContent?.trim().length > 20) break;
      }

      if (!heroEl) return null;

      // Extract headings
      const headings = heroEl.querySelectorAll('h1, h2, [class*="headline"], [class*="title"]');
      const headingTexts = Array.from(headings).map(h => h.textContent?.trim()).filter(Boolean);

      // Extract CTAs
      const ctas = heroEl.querySelectorAll('a[href], button');
      const ctaItems = Array.from(ctas).map(btn => ({
        text: btn.textContent?.trim() || btn.getAttribute('aria-label') || null,
        href: btn.tagName === 'A' ? btn.getAttribute('href') : null,
        type: btn.tagName.toLowerCase(),
        className: btn.className || null
      })).filter(c => c.text);

      // Extract subheadline/paragraph text
      const paragraphs = heroEl.querySelectorAll('p, [class*="subtitle"], [class*="description"], [class*="subheading"]');
      const subtexts = Array.from(paragraphs).map(p => p.textContent?.trim()).filter(Boolean);

      return {
        headlines: headingTexts,
        subheadlines: subtexts,
        ctas: ctaItems,
        hasBackground: !!(heroEl.style.backgroundImage || heroEl.querySelector('video, canvas, img')),
        className: heroEl.className || null
      };
    });
  }

  /**
   * Extract all major sections with their content
   */
  async extractSections() {
    return await this.page.evaluate(() => {
      const sectionSelectors = [
        'section', 'main > div', '[data-section]',
        '[class*="section"]', 'article', '.content-block'
      ];

      // Get all sections, deduplicate by element reference
      const sectionSet = new Set();
      const sections = [];

      for (const selector of sectionSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          if (!sectionSet.has(el) && el.textContent?.trim().length > 30) {
            sectionSet.add(el);

            const heading = el.querySelector('h1, h2, h3, [class*="heading"], [class*="title"]');
            const paragraphs = el.querySelectorAll('p, [class*="text"], [class*="copy"]');
            const images = el.querySelectorAll('img');
            const buttons = el.querySelectorAll('a[href], button');

            sections.push({
              id: el.id || el.getAttribute('data-section') || el.className?.split(' ')[0] || 'unknown',
              className: el.className || null,
              heading: heading?.textContent?.trim() || null,
              bodyCopy: Array.from(paragraphs).map(p => p.textContent?.trim()).filter(Boolean).slice(0, 5),
              ctaTexts: Array.from(buttons).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 3),
              imageCount: images.length,
              wordCount: el.textContent?.trim().split(/\s+/).length || 0
            });
          }
        });
      }

      return sections;
    });
  }

  /**
   * Extract project/case study cards (common in portfolios)
   */
  async extractProjects() {
    return await this.page.evaluate(() => {
      // Try common project/portfolio selectors
      const projectSelectors = [
        '[class*="project"]', '[class*="case-study"]', '[class*="work"]',
        '[class*="portfolio"]', '[class*="gallery"]', '[data-type="project"]',
        '.card[class*="project"]', '.grid > article'
      ];

      const projectSet = new Set();
      const projects = [];

      for (const selector of projectSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          if (!projectSet.has(el) && el.textContent?.trim().length > 10) {
            projectSet.add(el);

            const titleEl = el.querySelector('h2, h3, h4, [class*="title"], [class*="name"]');
            const descEl = el.querySelector('p, [class*="description"], [class*="excerpt"]');
            const tags = el.querySelectorAll('[class*="tag"], [class*="category"], [class*="tech"]');
            const link = el.querySelector('a[href]');
            const img = el.querySelector('img');

            projects.push({
              title: titleEl?.textContent?.trim() || null,
              description: descEl?.textContent?.trim() || null,
              tags: Array.from(tags).map(t => t.textContent?.trim()).filter(Boolean),
              href: link?.getAttribute('href') || null,
              imageSrc: img?.getAttribute('src') || img?.getAttribute('data-src') || null,
              imageAlt: img?.getAttribute('alt') || null,
              className: el.className || null
            });
          }
        });
      }

      return projects;
    });
  }

  /**
   * Extract footer content (links, social URLs, copyright, contact)
   */
  async extractFooter() {
    return await this.page.evaluate(() => {
      const footer = document.querySelector('footer, [role="contentinfo"], [class*="footer"]');
      if (!footer) return null;

      const links = footer.querySelectorAll('a[href]');
      const linkItems = Array.from(links).map(a => ({
        label: a.textContent?.trim() || null,
        href: a.getAttribute('href'),
        isSocial: !!(a.getAttribute('href')?.match(/(twitter|facebook|instagram|linkedin|github|dribbble|behance)/i) ||
                     a.className?.match(/social/i)),
        ariaLabel: a.getAttribute('aria-label') || null
      })).filter(l => l.label || l.href);

      const copyright = footer.textContent?.match(/©\s*\d{4}[^©]*/)?.[0] ||
                        footer.textContent?.match(/Copyright[^.]*\./)?.[0] || null;

      const contactEmail = footer.textContent?.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;

      return {
        links: linkItems,
        copyright,
        contactEmail,
        className: footer.className || null
      };
    });
  }

  /**
   * Extract interactive elements (form labels, placeholders, error messages, tooltips)
   */
  async extractInteractive() {
    return await this.page.evaluate(() => {
      const forms = document.querySelectorAll('form, [class*="form"], [class*="contact"]');
      const formFields = [];

      forms.forEach(form => {
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
          const label = form.querySelector(`label[for="${input.id}"]`) ||
                        input.closest('label') ||
                        input.getAttribute('aria-label');
          formFields.push({
            type: input.type || input.tagName.toLowerCase(),
            label: typeof label === 'string' ? label : label?.textContent?.trim() || null,
            placeholder: input.placeholder || null,
            required: input.required || false,
            name: input.name || null,
            id: input.id || null
          });
        });
      });

      const tooltips = document.querySelectorAll('[title], [data-tooltip], [aria-describedby]');
      const tooltipItems = Array.from(tooltips).map(el => ({
        text: el.textContent?.trim().slice(0, 100) || null,
        tooltip: el.getAttribute('title') || el.getAttribute('data-tooltip') || null,
        tagName: el.tagName.toLowerCase()
      })).filter(t => t.tooltip);

      return {
        forms: formFields,
        tooltips: tooltipItems,
        formCount: forms.length
      };
    });
  }

  /**
   * Extract all media references (images, videos, SVGs with their attributes)
   */
  async extractMedia() {
    return await this.page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img')).map(img => ({
        src: img.getAttribute('src') || img.getAttribute('data-src') || null,
        srcset: img.getAttribute('srcset') || null,
        alt: img.getAttribute('alt') || null,
        loading: img.getAttribute('loading') || null,
        width: img.getAttribute('width') || img.naturalWidth || null,
        height: img.getAttribute('height') || img.naturalHeight || null,
        className: img.className || null
      })).filter(img => img.src);

      const videos = Array.from(document.querySelectorAll('video')).map(video => ({
        src: video.getAttribute('src') || null,
        sources: Array.from(video.querySelectorAll('source')).map(s => s.getAttribute('src')),
        poster: video.getAttribute('poster') || null,
        autoplay: video.autoplay || false,
        muted: video.muted || false,
        loop: video.loop || false
      }));

      const svgs = Array.from(document.querySelectorAll('svg[role="img"], svg[aria-label], svg[title]')).map(svg => ({
        ariaLabel: svg.getAttribute('aria-label') || svg.getAttribute('title') || null,
        role: svg.getAttribute('role') || null,
        viewBox: svg.getAttribute('viewBox') || null,
        inline: true
      }));

      return {
        images: images.slice(0, 50), // Cap to avoid huge output
        videos,
        svgs: svgs.slice(0, 20),
        totalImages: document.querySelectorAll('img').length
      };
    });
  }

  /**
   * Generate a markdown summary section for DESIGN.md
   */
  toDesignSection(inventory) {
    if (!inventory) return '';

    let md = `## 14. Content Inventory\n\n`;
    md += `> **Extracted:** ${inventory.extracted_at}\n`;
    md += `> **Source:** Live DOM extraction (EXTRACTED confidence)\n\n`;

    // Metadata
    if (inventory.metadata?.title) {
      md += `### Page Metadata\n`;
      md += `- **Title:** ${inventory.metadata.title}\n`;
      if (inventory.metadata.description) md += `- **Description:** ${inventory.metadata.description}\n`;
      if (inventory.metadata.lang) md += `- **Language:** ${inventory.metadata.lang}\n`;
      md += `\n`;
    }

    // Navigation
    if (inventory.navigation?.length > 0) {
      md += `### Navigation\n`;
      inventory.navigation.forEach(nav => {
        md += `\n**${nav.name}:**\n`;
        nav.items.forEach((item, i) => {
          md += `${i + 1}. [${item.label}](${item.href})`;
          if (item.ariaLabel) md += ` — *${item.ariaLabel}*`;
          md += `\n`;
        });
      });
      md += `\n`;
    }

    // Hero
    if (inventory.hero) {
      md += `### Hero Section\n`;
      if (inventory.hero.headlines?.length > 0) {
        md += `- **Headline:** ${inventory.hero.headlines.join(' / ')}\n`;
      }
      if (inventory.hero.subheadlines?.length > 0) {
        md += `- **Subheadline:** ${inventory.hero.subheadlines.join(' / ')}\n`;
      }
      if (inventory.hero.ctas?.length > 0) {
        md += `- **CTAs:** ${inventory.hero.ctas.map(c => `"${c.text}"${c.href ? ` → ${c.href}` : ''}`).join(', ')}\n`;
      }
      md += `\n`;
    }

    // Sections summary
    if (inventory.sections?.length > 0) {
      md += `### Page Sections\n\n`;
      md += `| # | Section | Heading | Word Count | CTAs |\n`;
      md += `|---|---------|---------|------------|------|\n`;
      inventory.sections.forEach((section, i) => {
        md += `| ${i + 1} | \`${section.id}\` | ${section.heading || '—'} | ${section.wordCount} | ${section.ctaTexts?.slice(0, 2).join(', ') || '—'} |\n`;
      });
      md += `\n`;
    }

    // Projects
    if (inventory.projects?.length > 0) {
      md += `### Projects / Case Studies\n\n`;
      md += `| # | Title | Description | Tags |\n`;
      md += `|---|-------|-------------|------|\n`;
      inventory.projects.forEach((project, i) => {
        const desc = project.description ? project.description.slice(0, 60) + (project.description.length > 60 ? '...' : '') : '—';
        const tags = project.tags?.slice(0, 2).join(', ') || '—';
        md += `| ${i + 1} | ${project.title || 'Untitled'} | ${desc} | ${tags} |\n`;
      });
      md += `\n`;
    }

    // Footer
    if (inventory.footer) {
      md += `### Footer\n`;
      if (inventory.footer.copyright) md += `- **Copyright:** ${inventory.footer.copyright}\n`;
      if (inventory.footer.contactEmail) md += `- **Contact:** ${inventory.footer.contactEmail}\n`;
      if (inventory.footer.links?.length > 0) {
        md += `- **Links:** ${inventory.footer.links.filter(l => !l.isSocial).map(l => l.label).join(', ')}\n`;
        const socials = inventory.footer.links.filter(l => l.isSocial).map(l => l.label);
        if (socials.length > 0) md += `- **Social:** ${socials.join(', ')}\n`;
      }
      md += `\n`;
    }

    // Media summary
    if (inventory.media) {
      md += `### Media Summary\n`;
      md += `- **Images:** ${inventory.media.totalImages || inventory.media.images?.length || 0}\n`;
      md += `- **Videos:** ${inventory.media.videos?.length || 0}\n`;
      md += `- **Inline SVGs:** ${inventory.media.svgs?.length || 0}\n`;
      md += `\n`;
    }

    md += `**Confidence:** EXTRACTED\n`;

    return md;
  }
}

module.exports = { ContentExtractor };
