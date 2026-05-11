import os
import sys
import argparse
import re
import hashlib
import requests
import genanki
import logging
from datetime import datetime
import shutil
import random

# Add current directory to path to import models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from models import get_models

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# SKILL_ROOT is the parent directory of 'src' (i.e., the 'anki-generator' folder)
SKILL_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# User Home Directory for Persistent Cache (REMOVED: User wants cache in content folder)
# USER_HOME = os.path.expanduser("~")
# USER_CACHE_ROOT = os.path.join(USER_HOME, ".anki_generator")

# Output is relative to where the script is run (CWD)
# The user wants the cache to be in the SAME FOLDER as the notes (CWD)
CWD = os.getcwd()

# Local Cache & Logs (inside the Content folder)
CONTENT_CACHE_ROOT = os.path.join(CWD, ".anki_cache")
CACHE_DIR = os.path.join(CONTENT_CACHE_ROOT, "mermaid_hashes")
MEDIA_DIR = os.path.join(CONTENT_CACHE_ROOT, "media_tmp")
LOGS_DIR = CWD # Audit missing file goes here

# Ensure persistent directories exist
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(MEDIA_DIR, exist_ok=True)
# os.makedirs(LOGS_DIR, exist_ok=True) # CWD exists by definition


class VisualEngine:
    """Handles rendering of Mermaid diagrams to images."""
    
    @staticmethod
    def render(mermaid_code):
        """
        Renders Mermaid code to a PNG file.
        Returns the absolute path to the image file.
        """
        # Create a stable hash for the content
        content_hash = hashlib.sha256(mermaid_code.encode('utf-8')).hexdigest()
        filename = f"mermaid_{content_hash}.png"
        cache_path = os.path.join(CACHE_DIR, filename)
        
        # Check cache
        if os.path.exists(cache_path):
            logger.info(f"VisualEngine: Cache hit for {filename}")
            return cache_path

        logger.info(f"VisualEngine: Rendering {filename}...")
        
        # Encode for API
        graphbytes = mermaid_code.encode("utf8")
        import base64
        base64_bytes = base64.b64encode(graphbytes)
        base64_string = base64_bytes.decode("ascii")
        
        url = "https://mermaid.ink/img/" + base64_string
        
        try:
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                with open(cache_path, 'wb') as f:
                    f.write(response.content)
                return cache_path
            else:
                logger.error(f"VisualEngine: API Error {response.status_code}")
                return VisualEngine._create_error_image(cache_path)
        except Exception as e:
            logger.error(f"VisualEngine: Exception {e}")
            return VisualEngine._create_error_image(cache_path)

    @staticmethod
    def _create_error_image(path):
        # Create a simple placeholder text file or copy a generic error image
        # For now, just write a dummy file to avoid crashing, but log error
        with open(path, 'w') as f:
            f.write("Error rendering mermaid")
        return path


class AuditModule:
    """Audits content coverage against required keywords."""
    
    def __init__(self, keywords):
        self.keywords = [k.strip().lower() for k in keywords if k.strip()]
        
    def check_coverage(self, all_text_content):
        """
        Checks how many keywords satisfy the coverage condition.
        Returns (score, missing_keywords).
        """
        if not self.keywords:
            return 1.0, []
            
        text_lower = all_text_content.lower()
        matched = []
        missing = []
        
        for k in self.keywords:
            # Simple substring match (can be improved to regex word boundary)
            if k in text_lower:
                matched.append(k)
            else:
                missing.append(k)
        
        score = len(matched) / len(self.keywords)
        return score, missing


class AnkiBuilder:
    def __init__(self, subject):
        self.subject = subject
        # Add a random component to deck_id to ensure a new deck is created in Anki
        # even if the name is the same as before.
        seed_str = f"{subject}_{random.random()}"
        self.deck_id = int(hashlib.sha256(seed_str.encode('utf-8')).hexdigest()[:8], 16)
        self.deck = genanki.Deck(self.deck_id, subject)
        
        # Load CSS
        css_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'anki_styles.css')
        with open(css_path, 'r') as f:
            self.css = f.read()
            
        self.models = get_models(self.css)
        self.media_files = []
        self.all_content_text = "" # For audit

    def process_file(self, file_path):
        logger.info(f"Processing file: {file_path}")
        card_count = 0
        
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return
            
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            
            # Detect Tags
            tags = []
            if '[REV]' in line:
                tags.append('reverse')
                line = line.replace('[REV]', '').strip()
            if '[SCENARIO]' in line:
                tags.append('scenario')
                line = line.replace('[SCENARIO]', '').strip()
                
            # Split fields
            parts = line.split('\t')
            if len(parts) < 2:
                continue # Skip invalid lines
                
            question = parts[0].strip()
            answer = parts[1].strip()
            intuition = parts[2].strip() if len(parts) > 2 else ""
            
            # Mermaid Handling
            question = self._process_mermaid(question)
            answer = self._process_mermaid(answer)

            # Math Handling (Markdown $ -> Anki \( \))
            question = self._fix_math_syntax(question)
            answer = self._fix_math_syntax(answer)

            # Markdown Styling (Markdown ** -> HTML <b>)
            question = self._fix_markdown(question)
            answer = self._fix_markdown(answer)
            
            # Update Audit Content
            self.all_content_text += f"{question} {answer} "

            # Determine Model implementation
            self._create_note(question, answer, intuition, tags)
            card_count += 1
            
        logger.info(f"Successfully added {card_count} cards from {file_path}")

    def _fix_markdown(self, text):
        """Converts Markdown bold/italic to HTML for Anki, strictly protecting MathJax blocks."""
        matches = []
        
        def protect(m):
            matches.append(m.group(0))
            return f"__MATH_BLOCK_{len(matches)-1}__"

        # 1. Protect Anki Math: \( ... \) and \[ ... \]
        # We use strict regex for Anki delimiters
        # Note: In python regex, to match literal \( we need \\\(
        pattern_inline = r'\\\((.*?)\\\)'
        pattern_block = r'\\\[(.*?)\\\]'
        
        text = re.sub(pattern_inline, protect, text, flags=re.DOTALL)
        text = re.sub(pattern_block, protect, text, flags=re.DOTALL)

        # 2. Apply Markdown
        # Bold: **text** -> <b>text</b>
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        # Italic: *text* -> <i>text</i>
        # Negative lookbehind/ahead to avoid matching **
        text = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<i>\1</i>', text)
        
        # 3. Restore Math
        for i, match in enumerate(matches):
            text = text.replace(f"__MATH_BLOCK_{i}__", match)
            
        return text

    def _fix_math_syntax(self, text):
        """Converts Markdown-style math to Anki MathJax syntax."""
        # 1. Block Math: $$...$$ -> \[...\]
        # We use a non-greedy match for content
        text = re.sub(r'\$\$(.+?)\$\$', r'\\[\1\\]', text, flags=re.DOTALL)
        
        # 2. Inline Math: $...$ -> \(...\)
        # Avoid matching across empty lines to be safe, but allow intra-line matching
        # Lookbehind/ahead to ensure it's not part of a currency amount like $100 (heuristic: requires non-digit boundary or space)
        # Simple version: $...$ 
        text = re.sub(r'(?<!\\)\$(.+?)(?<!\\)\$', r'\\(\1\\)', text)
        
        return text

    def _process_mermaid(self, text):
        """Finds [IMG_?] tags, extracts mermaid code, renders it, and replaces with <img> tag."""
        # Regex for [IMG_Q] or [IMG_A] followed by code until end of string or next tag?
        # Simpler approach: Assuming mermaid code is marked explicitly or is the rest of the line
        # The design doc says: `[IMG_A] graph TD...`
        
        pattern = r'\[IMG_[QA]\](.*)'
        match = re.search(pattern, text, re.DOTALL)
        if match:
            mermaid_code = match.group(1).strip()
            # If code starts with ```mermaid, strip it
            mermaid_code = mermaid_code.replace('```mermaid', '').replace('```', '').strip()
            
            if mermaid_code:
                img_path = VisualEngine.render(mermaid_code)
                img_filename = os.path.basename(img_path)
                
                # Copy to local media dir for packaging if not already there
                dest = os.path.join(MEDIA_DIR, img_filename)
                if not os.path.exists(dest):
                    shutil.copy(img_path, dest)
                
                if dest not in self.media_files:
                    self.media_files.append(dest)
                
                # Replace the entire match with the image tag
                # Note: This replaces the code with the image. 
                # If we want text + image, we should only replace the code part.
                # Strategy: Append image to text.
                replacement = f'<br><img src="{img_filename}">'
                return re.sub(pattern, replacement, text)
        
        return text

    def _create_note(self, q, a, intuition, tags):
        # Tags string for the model field
        tags_str = ' '.join(tags)

        # Inject Scenario Badge
        if 'scenario' in tags:
            q = f'<div class="tag-scenario">Scenario</div><br>{q}'

        # Fix Markdown/Math in Intuition
        if intuition:
            intuition = self._fix_math_syntax(intuition)
            intuition = self._fix_markdown(intuition)

        # 1. Check for Cloze {{c...}}
        if '{{c' in q:
            model = self.models['CLOZE']
            extra = a
            if intuition:
                extra += f"<br><br><div class='intuition'>💡 {intuition}</div>"
            fields = [q, extra, tags_str]
            self._add_note_safe(model, fields)
            return

        # 2. Check for Reverse
        if 'reverse' in tags:
            model = self.models['REVERSE']
            # Reverse model doesn't support Intuition yet. Append to answer.
            answer_text = a
            if intuition:
                answer_text += f"<br><br><div class='intuition'>💡 {intuition}</div>"
            fields = [q, answer_text, tags_str]
            self._add_note_safe(model, fields)
            return

        # 3. Default Basic
        model = self.models['BASIC']
        # Basic model fields: Question, Answer, Intuition, Tags
        fields = [q, a, intuition, tags_str]
        self._add_note_safe(model, fields)

    def _add_note_safe(self, model, fields):
        # Create stable GUID
        # use model id + first field content
        guid = genanki.guid_for(model.model_id, fields[0])
        
        note = genanki.Note(
            model=model,
            fields=fields,
            tags=[],
            guid=guid
        )
        self.deck.add_note(note)

    def export(self, filename):
        # Save directly to Current Working Directory
        out_path = os.path.join(CWD, filename)
        package = genanki.Package(self.deck)
        package.media_files = self.media_files
        package.write_to_file(out_path)
        logger.info(f"Deck saved to {out_path}")
        return out_path



def clean_deck_name(filename):
    """
    Converts a filename like '1_pareto_essentials.txt' to 'Pareto Essentials'.
    Removes leading numbers/underscores and file extension.
    If the name consists ONLY of numbers (e.g. '1.txt'), it preserves them.
    """
    base = os.path.basename(filename)
    name = os.path.splitext(base)[0]
    
    # Try to remove leading digits and underscores/dots/spaces
    cleaned = re.sub(r'^[\d\._\s]+', '', name)
    
    # If the name is now empty, it means the filename was just numbers.
    # In that case, use the original name (base without extension).
    if not cleaned:
        cleaned = name
        
    # Replace remaining underscores with spaces
    cleaned = cleaned.replace('_', ' ')
    
    # Title Case
    return cleaned.title()

def main():
    parser = argparse.ArgumentParser(description="Anki Generator v2.1")
    parser.add_argument("--subject", required=True, help="Subject name (Parent Deck name)")
    parser.add_argument("--decks", nargs='+', required=True, help="List of input .txt files")
    parser.add_argument("--audit-keywords", type=str, default="", help="Comma separated keywords")
    
    args = parser.parse_args()
    
    all_decks = []
    all_media = []
    full_audit_text = ""
    
    # Process each file as a separate sub-deck
    for deck_file in args.decks:
        if not os.path.exists(deck_file):
            logger.warning(f"File not found: {deck_file}")
            continue
            
        # Determine Sub-deck Name
        sub_name = clean_deck_name(deck_file)
        # Use a flatter structure: "Subject - Subname" instead of hierarchy "Subject::Subname"
        # to see if it resolves the "blank" deck issue.
        full_deck_name = f"{args.subject} - {sub_name}"
        
        logger.info(f"Building Deck: {full_deck_name} from {deck_file}")
        
        # Initialize Builder for this specific sub-deck
        builder = AnkiBuilder(full_deck_name)
        builder.process_file(deck_file)
        
        # Collect results
        all_decks.append(builder.deck)
        all_media.extend(builder.media_files)
        full_audit_text += builder.all_content_text + " "

    if not all_decks:
        logger.error("No decks were generated. Exiting.")
        sys.exit(1)

    # Audit
    if args.audit_keywords:
        keywords = args.audit_keywords.split(',')
        auditor = AuditModule(keywords)
        score, missing = auditor.check_coverage(full_audit_text)
        
        logger.info(f"Audit Score: {score*100:.1f}%")
        if missing:
            logger.warning(f"Missing Keywords: {', '.join(missing)}")
            with open(os.path.join(LOGS_DIR, "audit_missing.txt"), "w") as f:
                f.write("\n".join(missing))
            
            if score < 0.7:
                logger.error("CRITICAL: Coverage too low (<70%). Aborting package generation.")
                sys.exit(1)

    # Export Package containing ALL sub-decks
    out_filename = f"{args.subject}_v2.0.apkg"
    out_path = os.path.join(CWD, out_filename)
    
    package = genanki.Package(all_decks)
    package.media_files = list(set(all_media)) # Deduplicate media
    package.write_to_file(out_path)
    
    logger.info(f"Package saved to {out_path}")
    logger.info(f"Contains {len(all_decks)} decks: {[d.name for d in all_decks]}")

if __name__ == "__main__":
    main()
