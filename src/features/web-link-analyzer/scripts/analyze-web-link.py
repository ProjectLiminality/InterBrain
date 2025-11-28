#!/usr/bin/env python3
"""
InterBrain Web Link Analyzer

Fetches a web page, analyzes it using Claude API, and generates a personalized
summary based on the user's profile. Optionally downloads a representative image.

Usage:
    python analyze-web-link.py --url URL --output-dir DIR --api-key KEY [--profile PATH]
"""

import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse


class HTMLTextExtractor(HTMLParser):
    """Extract text content from HTML, removing scripts and styles."""

    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.skip_tags = {'script', 'style', 'nav', 'footer', 'header', 'noscript'}
        self.current_skip_depth = 0
        self.title = None
        self.in_title = False
        self.meta_description = None
        self.og_image = None
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag in self.skip_tags:
            self.current_skip_depth += 1
        elif tag == 'title':
            self.in_title = True
        elif tag == 'meta':
            name = attrs_dict.get('name', '').lower()
            prop = attrs_dict.get('property', '').lower()
            content = attrs_dict.get('content', '')

            if name == 'description':
                self.meta_description = content
            elif prop == 'og:image':
                self.og_image = content
        elif tag == 'img':
            src = attrs_dict.get('src', '')
            if src and not src.startswith('data:'):
                self.images.append(src)

    def handle_endtag(self, tag):
        if tag in self.skip_tags and self.current_skip_depth > 0:
            self.current_skip_depth -= 1
        elif tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title = data.strip()
        elif self.current_skip_depth == 0:
            text = data.strip()
            if text:
                self.text_parts.append(text)

    def get_text(self):
        return ' '.join(self.text_parts)


def fetch_page(url: str) -> dict:
    """Fetch web page and extract content."""
    print(f"Fetching: {url}", file=sys.stderr)

    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) InterBrain/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    }

    req = urllib.request.Request(url, headers=headers)

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            html = response.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as e:
        raise Exception(f"HTTP Error {e.code}: {e.reason}")
    except urllib.error.URLError as e:
        raise Exception(f"URL Error: {e.reason}")

    # Parse HTML
    parser = HTMLTextExtractor()
    parser.feed(html)

    # Resolve relative image URLs
    images = []
    for img_src in parser.images[:10]:  # Limit to 10 images
        try:
            full_url = urljoin(url, img_src)
            images.append(full_url)
        except Exception:
            pass

    if parser.og_image:
        try:
            parser.og_image = urljoin(url, parser.og_image)
        except Exception:
            pass

    return {
        'url': url,
        'title': parser.title or urlparse(url).netloc,
        'description': parser.meta_description or '',
        'text_content': parser.get_text()[:8000],  # Limit text length
        'og_image': parser.og_image,
        'images': images,
    }


def read_user_profile(profile_path: str) -> str:
    """Read user profile from CLAUDE.md file."""
    try:
        with open(profile_path, 'r', encoding='utf-8') as f:
            content = f.read()
            # Limit to first 4000 chars for context efficiency
            return content[:4000]
    except FileNotFoundError:
        print(f"Profile not found: {profile_path}", file=sys.stderr)
        return "No user profile available. Generate a general-purpose summary."
    except Exception as e:
        print(f"Error reading profile: {e}", file=sys.stderr)
        return "No user profile available. Generate a general-purpose summary."


def call_claude_api(api_key: str, page_content: dict, user_profile: str) -> dict:
    """Call Claude API to generate personalized summary."""
    print("Calling Claude API...", file=sys.stderr)

    # Import anthropic here to provide clear error if not installed
    try:
        import anthropic
    except ImportError:
        raise Exception("anthropic package not installed. Run: pip install anthropic")

    client = anthropic.Anthropic(api_key=api_key)

    system_prompt = f"""You are analyzing a web page to create a personalized summary for a knowledge management system called InterBrain.

USER PROFILE:
{user_profile}

Based on the user's interests, role, and philosophical framework described above, create a summary that:
1. Highlights aspects most relevant to this specific user
2. Uses language and framing that resonates with their values
3. Extracts actionable insights aligned with their goals

You must respond with ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{{
  "title": "A clear, descriptive title for this content",
  "summary": "2-3 paragraphs of personalized analysis",
  "keyPoints": ["point 1", "point 2", "point 3"],
  "relevance": "Why this matters for this user specifically",
  "representativeImageUrl": "URL of the best image from the available images, or null if none suitable"
}}"""

    user_prompt = f"""Analyze this web page:

URL: {page_content['url']}
Page Title: {page_content['title']}
Meta Description: {page_content['description']}

Available Images:
- og:image: {page_content['og_image'] or 'none'}
- Other images: {', '.join(page_content['images']) if page_content['images'] else 'none'}

Page Content:
{page_content['text_content']}

Choose the best representative image (prefer logos for organizations, infographics for concepts, og:image as fallback). Return null for representativeImageUrl if no good image is available."""

    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        system=system_prompt,
        messages=[
            {"role": "user", "content": user_prompt}
        ]
    )

    # Extract text from response
    response_text = ''.join(
        block.text for block in message.content
        if hasattr(block, 'text')
    )

    # Parse JSON response
    try:
        result = json.loads(response_text)
        return {
            'title': result.get('title', page_content['title']),
            'summary': result.get('summary', ''),
            'keyPoints': result.get('keyPoints', []),
            'relevance': result.get('relevance', ''),
            'representativeImageUrl': result.get('representativeImageUrl'),
        }
    except json.JSONDecodeError as e:
        print(f"Failed to parse Claude response: {e}", file=sys.stderr)
        print(f"Response was: {response_text[:500]}", file=sys.stderr)
        raise Exception("Failed to parse AI response as JSON")


def download_image(image_url: str, output_dir: Path) -> str | None:
    """Download image to output directory. Returns filename or None."""
    if not image_url:
        return None

    print(f"Downloading image: {image_url}", file=sys.stderr)

    try:
        # Extract filename from URL
        parsed = urlparse(image_url)
        filename = os.path.basename(parsed.path) or 'featured-image'

        # Ensure extension
        if '.' not in filename:
            filename += '.jpg'

        # Sanitize filename
        filename = re.sub(r'[^a-zA-Z0-9._-]', '_', filename)

        # Download
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) InterBrain/1.0',
        }
        req = urllib.request.Request(image_url, headers=headers)

        output_path = output_dir / filename
        with urllib.request.urlopen(req, timeout=30) as response:
            with open(output_path, 'wb') as f:
                f.write(response.read())

        print(f"Image saved: {filename}", file=sys.stderr)
        return filename

    except Exception as e:
        print(f"Failed to download image: {e}", file=sys.stderr)
        return None


def generate_readme(analysis: dict, original_url: str, image_path: str | None) -> str:
    """Generate README.md content from analysis."""
    content = f"# {analysis['title']}\n\n"
    content += f"> **Source**: [{original_url}]({original_url})\n\n"

    if image_path:
        content += f"![{analysis['title']}](./{image_path})\n\n"

    content += f"## Summary\n\n{analysis['summary']}\n\n"

    if analysis['keyPoints']:
        content += "## Key Points\n\n"
        for point in analysis['keyPoints']:
            content += f"- {point}\n"
        content += "\n"

    if analysis['relevance']:
        content += f"## Relevance\n\n{analysis['relevance']}\n\n"

    content += "---\n*AI-generated summary by InterBrain*\n"

    return content


def update_udd_file(output_dir: Path, image_path: str | None):
    """Update .udd file to reference the downloaded image as DreamTalk."""
    udd_path = output_dir / '.udd'

    if not udd_path.exists():
        print(".udd file not found, skipping update", file=sys.stderr)
        return

    try:
        with open(udd_path, 'r', encoding='utf-8') as f:
            udd = json.load(f)

        if image_path:
            udd['dreamTalk'] = image_path

        with open(udd_path, 'w', encoding='utf-8') as f:
            json.dump(udd, f, indent=2)

        print("Updated .udd file", file=sys.stderr)

    except Exception as e:
        print(f"Failed to update .udd: {e}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description='Analyze web link with Claude AI')
    parser.add_argument('--url', required=True, help='URL to analyze')
    parser.add_argument('--output-dir', required=True, help='Output directory (DreamNode repo path)')
    parser.add_argument('--api-key', required=True, help='Anthropic API key')
    parser.add_argument('--profile', default=None, help='Path to CLAUDE.md user profile')

    args = parser.parse_args()

    output_dir = Path(args.output_dir)

    # Default profile path
    if args.profile:
        profile_path = args.profile
    else:
        profile_path = os.path.expanduser('~/.claude/CLAUDE.md')

    try:
        # Step 1: Fetch page content
        print("Step 1: Fetching web page...", file=sys.stderr)
        page_content = fetch_page(args.url)
        print(f"Fetched: {page_content['title']}", file=sys.stderr)

        # Step 2: Read user profile
        print("Step 2: Reading user profile...", file=sys.stderr)
        user_profile = read_user_profile(profile_path)

        # Step 3: Call Claude API
        print("Step 3: Generating AI summary...", file=sys.stderr)
        analysis = call_claude_api(args.api_key, page_content, user_profile)
        print(f"Generated summary: {analysis['title']}", file=sys.stderr)

        # Step 4: Download image
        print("Step 4: Downloading image...", file=sys.stderr)
        image_path = download_image(analysis['representativeImageUrl'], output_dir)

        # Step 5: Generate README
        print("Step 5: Writing README.md...", file=sys.stderr)
        readme_content = generate_readme(analysis, args.url, image_path)
        readme_path = output_dir / 'README.md'
        with open(readme_path, 'w', encoding='utf-8') as f:
            f.write(readme_content)

        # Step 6: Update .udd file
        print("Step 6: Updating .udd...", file=sys.stderr)
        update_udd_file(output_dir, image_path)

        # Output result as JSON for TypeScript to parse
        result = {
            'success': True,
            'title': analysis['title'],
            'imagePath': image_path,
        }
        print(json.dumps(result))

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == '__main__':
    main()
