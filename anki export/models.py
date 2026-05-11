import genanki
import random

def get_models(css_content):
    """
    Returns a dictionary of genanki.Model objects initialized with the provided CSS.
    
    Supported Models:
    - BASIC: Standard Q&A with Legacy "Card Container" layout
    - CLOZE: Fill-in-the-blank with Legacy layout
    - REVERSE: Bidirectional with Legacy layout
    """
    
    # Generate unique IDs for this run to avoid conflicts
    # Use a range that avoids common reserved IDs
    id_seed = random.randrange(1 << 30, 2 << 30)
    
    # 1. Basic Model (Legacy Layout)
    # The structure must match the CSS: .card -> .card-container -> .question / .separator / .answer
    basic_model = genanki.Model(
        id_seed + 1,
        'AnkiGen v2.1 Basic',
        fields=[
            {'name': 'Question'},
            {'name': 'Answer'},
            {'name': 'Intuition'},
            {'name': 'Tags'},
        ],
        templates=[
            {
                'name': 'Card 1',
                'qfmt': '''
<div class="card-container">
    <div class="question">{{Question}}</div>
</div>
''',
                'afmt': '''
<div class="card-container">
    <div class="question">{{Question}}</div>
    <div class="separator"></div>
    <div class="answer">{{Answer}}</div>
    {{#Intuition}}
    <br>
    <div class="intuition" style="font-size: 0.9em; color: #4a4a4a; background-color: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 10px;">
        <strong>💡 Intuizione:</strong> {{Intuition}}
    </div>
    {{/Intuition}}
</div>
''',
            },
        ],
        css=css_content
    )

    # 2. Cloze Model (Adapted Legacy Layout)
    cloze_model = genanki.Model(
        id_seed + 2,
        'AnkiGen v2.0 Cloze',
        fields=[
            {'name': 'Text'},
            {'name': 'Extra'},
            {'name': 'Tags'},
        ],
        templates=[
            {
                'name': 'Cloze Card',
                'qfmt': '''
<div class="card-container">
    <div class="question">{{cloze:Text}}</div>
</div>
''',
                'afmt': '''
<div class="card-container">
    <div class="question">{{cloze:Text}}</div>
    <div class="separator"></div>
    <div class="answer">{{Extra}}</div>
</div>
''',
            },
        ],
        css=css_content,
        model_type=genanki.Model.CLOZE
    )
    
    # 3. Reverse Model (Adapted Legacy Layout)
    reverse_model = genanki.Model(
        id_seed + 3,
        'AnkiGen v2.0 Reverse',
        fields=[
            {'name': 'Front'},
            {'name': 'Back'},
            {'name': 'Tags'},
        ],
        templates=[
            {
                'name': 'Card 1 (Forward)',
                'qfmt': '''
<div class="card-container">
    <div class="tag-reverse">Direct</div>
    <div class="question">{{Front}}</div>
</div>
''',
                'afmt': '''
<div class="card-container">
    <div class="tag-reverse">Direct</div>
    <div class="question">{{Front}}</div>
    <div class="separator"></div>
    <div class="answer">{{Back}}</div>
</div>
''',
            },
            {
                'name': 'Card 2 (Reverse)',
                'qfmt': '''
<div class="card-container">
    <div class="tag-reverse">Reverse</div>
    <div class="question">{{Back}}</div>
</div>
''',
                'afmt': '''
<div class="card-container">
    <div class="tag-reverse">Reverse</div>
    <div class="question">{{Back}}</div>
    <div class="separator"></div>
    <div class="answer">{{Front}}</div>
</div>
''',
            },
        ],
        css=css_content
    )
    
    return {
        'BASIC': basic_model,
        'CLOZE': cloze_model,
        'REVERSE': reverse_model
    }
