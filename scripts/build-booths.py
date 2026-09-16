#!/usr/bin/env python3
"""Turn the official booth sheet into seed records for the MFU Go Global Passport.

Source: https://docs.google.com/spreadsheets/d/1YSl-NRrnJCRqgCQE8EtN3X-JazTP4krxe18n5mFaVK0 (gid=0)
Decisions locked with Stanley, 12 Sep 2026 (rows re-synced to the sheet's renumbering 15 Sep 2026):
  - all 76 booths stampable, ids = the sheet's own codes
  - flat 10 base points per booth (quiet/busy auto-adjustment still swings it 8-13)
  - every booth active all three days
  - the 14 duplicate "Global Table" rows renamed from their cuisine
"""
import json

ACCENTS = ['#EF5F5F', '#0FAFD0', '#4C764F', '#F5C63C', '#FF919C',
           '#F0A445', '#45CFC0', '#E08761', '#2F5D3E']
EVENT_ID = 'mfu-go-global-2026'
EVENT_DAYS = ['2026-09-16', '2026-09-17', '2026-09-18']
BASE_POINTS = 10

# id, category, host, nameEn, shortName, description
# category is a new field (see notes.md) used to group 76 booths in the stamp grid.
ROWS = [
 ('ED1','educational','MAP SU, Australia Embassy','Australia Awards Mekong-Australia Partnership Scholarships (AA-MAP)','AA-MAP','Information on Australian education funding and opportunities'),
 ('ED2','educational','British Council Thailand','British Council Thailand','British Council','Information on UK education funding and opportunities'),
 ('ED3','educational','French Embassy','Campus France Thailand','Campus France','Information on French education funding by Campus France Thailand'),
 ('ED4','educational','Fulbright Thailand','Fulbright Thailand','Fulbright','Information on U.S. education funding and opportunities (Thailand-U.S. Educational Foundation)'),
 ('ED5','educational','Taiwan Education Center Thailand','Taiwan Education Center, Thailand','Taiwan EC','Information on Taiwan education funding and opportunities'),
 ('ED6','educational','Chiang Rai Rajabhat University','TOEFL/IELTS Testing Center','TOEFL/IELTS','TOEFL and IELTS examination information'),
 ('ED7','educational','GRD','MFU Go Global','MFU Go Global','International exchange programs and funding for MFU students'),
 ('ED8','educational','Student Employment and Internship Division','Match the International Internship','Internships','International internship opportunities for MFU students'),
 ('ED9','educational','School of Nursing 2','MFU Nursing | Go Global','Nursing Global','International nursing education, student exchange, research, and partnerships'),
 ('ED10','wellness','MFU Medical Center Hospital','Health Beyond Borders','Health Beyond','Health services and wellness from Mae Fah Luang University Medical Center Hospital'),
 ('ED11','educational','School of Medicine','Unlocking Nature, Decoding Cancer: From Bench to Bedside','Decoding Cancer','Cancer research from the laboratory bench to patient care, by the School of Medicine'),
 ('ED12','educational','School of Science','Eco-printing & Vegan Leather Workshop','Eco-printing','Innovation workshops on eco-printing and vegan leather'),
 ('ED13','educational','School of Nursing 1','MFU Nursing | CPR Experience','CPR Experience','CPR training through games, simulations, and hands-on practice'),
 ('ED14','educational','MLII','Lifelong Journey','Lifelong Journey','Online courses in Chinese and Anatomy; VR innovation demonstrations'),
 ('ED15','educational','Student Development Affairs 1','Global Compass','Global Compass','Game-based activity exploring freedom with responsibility and respect'),
 ('ED16','educational','Student Development Affairs 2','Act for Earth','Act for Earth','Game activity promoting environmental awareness and conservation'),
 ('ED17','educational','Student Development Affairs 3','Touch to Connect','Touch to Connect','Braille writing activity in Thai, Chinese, and English on stickers'),
 ('ED18','educational','Student Development Affairs 4','Fund & Friends','Fund & Friends','Information on international student welfare and scholarships with games'),
 ('ED19','educational','School of Cosmetic Science','Find Your Personal Color','Personal Color','Personal color analysis based on skin, hair, eye tone and undertone'),

 ('CL20','cultural','School of Sinology 1','Dress Like Chinese','Dress Like Chinese','Chinese culture learning through traditional clothing'),
 ('CL21','cultural','School of Sinology 2','Chinese Connection Knot','Chinese Knot','Chinese culture learning through traditional knot-tying'),
 ('CL22','cultural','Thai-Chinese Education Association','Chinese Ink & Art','Chinese Ink & Art','Chinese culture learning through brush painting'),
 ('CL23','cultural','Anti-Aging and Regenerative Medicine','Dolanan Anak: Games, Songs & Traditions','Dolanan Anak','Indonesian (Central Java) culture learning through games and traditions'),
 ('CL24','cultural','Institute for Mekong Civilization, Art, Culture','Lanna Spiderweb Flag Craft','Lanna Tung','Northern Thai culture learning through tung (spiderweb flag) weaving'),
 ('CL25','cultural','School of Social Innovation','Living Heritage in Action','Living Heritage','Indonesian culture through Angklung music and Tari Indang dance'),

 ('FD26','food','Tea and Coffee Institution','Global Sips','Global Sips','International culture learning through food and beverages'),
 ('FD27','food','School of Agricultural Industry 1','Izakaya – Japan','Izakaya','Japanese healthy local cuisine (Izakaya)'),
 ('FD28','food','School of Agricultural Industry 2','Green Heritage – Myanmar','Green Heritage','Myanmar healthy local cuisine'),
 ('FD29','food','School of Agricultural Industry 3','Yellow Star – Vietnam','Yellow Star','Vietnamese healthy local cuisine (Noodle)'),
 ('FD30','food','School of Agricultural Industry 4','Khatulistiwa – Indonesia','Khatulistiwa','Indonesian healthy local cuisine (Nasi Liwet and Ayam Serundeng)'),
 ('FD31','food','School of Agricultural Industry 5','Team India – India','Team India','Indian healthy local cuisine'),
 ('FD32','food','School of Agricultural Industry 6','MANIFEST – Thailand','MANIFEST','Thai healthy local cuisine'),
 ('FD33','food','School of Agricultural Industry 7','3nergy – Thailand','3nergy','Thai healthy local cuisine'),
 ('FD34','food','School of Agricultural Industry 8','Plang Borderless – Thailand · Myanmar · Laos','Plang Borderless','Healthy local cuisine across Thailand, Myanmar and Laos'),
 ('FD35','food','School of Agricultural Industry 9','IndoIndy – Indonesia','IndoIndy','Indonesian healthy local cuisine'),
 ('FD36','food','School of Agricultural Industry 10','Agro-Industry Table 10 (to be confirmed)','Agro Table 10','Healthy local cuisine — team to be confirmed'),
 ('FD37','food','School of Liberal Arts 1','Siam Spice','Siam Spice','Thai international cuisine (Hor Mok Talay)'),
 ('FD38','food','School of Liberal Arts 2','Flavors of Japan','Flavors of Japan','Japanese international cuisine (Chirashi Sushi)'),
 ('FD39','food','School of Liberal Arts 3','Nusantara Delights','Nusantara','Indonesian international cuisine (Ayam Rendang)'),
 ('FD40','food','School of Liberal Arts 4','Seoul TteokBokki','Seoul Tteokbokki','Korean international cuisine (Spicy Rice Cakes)'),
 ('FD41','food','School of Liberal Arts 5','The American Melting Pot','Melting Pot','American international cuisine (Cheesesteak Rolls, Caesar Salad)'),
 ('FD42','food','School of Liberal Arts 6','Assorted Burmese Fritters','Burmese Fritters','Burmese international cuisine (Dok Hto sticks)'),
 ('FD43','food','GRD','Global Table — Korea','Korea','Korean cuisine (hotteok, kimchi soup, fried chicken, tteokbokki)'),
 ('FD44','food','GRD','Global Table — Japan','Japan','Japanese cuisine (yakitori, mochi, yakisoba, sushi)'),
 ('FD45','food','GRD','Global Table — Germany','Germany','German cuisine (potato salad, apple pastries)'),
 ('FD46','food','GRD','Global Table — Indonesia','Indonesia','Indonesian cuisine (Siomay steamed dumplings)'),
 ('FD47','food','GRD','Global Table — Mexico','Mexico','Mexican cuisine (nachos, tacos, salsa)'),
 ('FD48','food','GRD','Global Table — Czechia','Czechia','Czech cuisine (Bramborák potato pancakes)'),
 ('FD49','food','GRD','Global Table — Bhutan','Bhutan','Bhutanese cuisine (chili cheese stew with rice)'),
 ('FD50','food','Consulate of India in Chiang Mai','A Sip of India','A Sip of India','International culture learning through Indian food'),
 ('FD51','food','GRD','French Food Fair','French Food Fair','French cuisine (Poulet Basquaise, Crêpes)'),
 ('FD52','food','GRD','Global Table — Thailand','Thailand','Thai cuisine'),
 ('FD53','food','GRD','Global Table — China','China','Chinese cuisine'),
 ('FD54','food','GRD','Global Table — Myanmar: Assorted Noodle Salad','Noodle Salad','Burmese assorted noodle salad street food'),
 ('FD55','food','GRD','Global Table — Myanmar: Turmeric Sticky Rice','Sticky Rice','Burmese yellow sticky rice with turmeric'),
 ('FD56','food','GRD','Global Table — Myanmar: Pyay Rice Salad','Pyay Rice Salad','Pyay-style rice salad from the Bago region'),
 ('FD57','food','GRD','Global Table — Myanmar: Shan Table','Shan Table','Shan tea leaf salad and Shan-Bamar stuffed tomatoes'),
 ('FD58','food','GRD','Global Table — Myanmar: Tea Shop Fritters','Tea Shop Fritters','Burmese vegetable fritters from tea shop culture'),
 ('FD59','food','GRD','Global Table — Myanmar: Desserts','Myanmar Desserts','Burmese desserts (sago soup, steamed banana)'),
 ('FD60','food','GRD','Global Table — Myanmar: Rice Drop Dessert','Rice Drop Dessert','Burmese rice drop dessert with coconut milk'),
 ('FD61','food','GRD','Global Table — Myanmar: Shan Rice Cake','Shan Rice Cake','Shan steamed rice cake with garlic and chili oil'),
 ('FD62','food','GRD','Global Table — Karen Curry','Karen Curry','Karen traditional curry with local herbs'),
 ('FD63','food','GRD','Global Table — Myanmar: Rakhine Table','Rakhine Table','Rakhine soup and anchovy salad from coastal Myanmar'),

 ('OPEN1','market','M-Store x Zero Waste (Grace) 1','Green Table','Green Table','Natural plant fiber plates and bowls from Gracz (100% sugarcane pulp)'),
 ('OPEN2','market','M-Store x Zero Waste (Grace) 2','M-Store','M-Store','MFU university products'),
 ('OPEN3','youth','GRD','ปะ ดิ มา กำ','ปะ ดิ มา กำ','Student workshops on entrepreneurship and creative crafts'),
 ('OPEN4','youth','GRD','Daisy Belle X Nadtasin MFU','Daisy Belle','Bag-making supplies, instruction, and hair accessories'),
 ('OPEN5','youth','GRD','¡LOTERÍA! — A Taste of Mexico','¡LOTERÍA!','Traditional Mexican Lotería game with cultural education'),
 ('OPEN6','youth','GRD','Crochet and Embroidery','Crochet','Student crochet and embroidery projects and sales'),
 ('OPEN7','youth','GRD','Model United Nations','MUN','MUN student activities and presentations'),
 ('OPEN8','youth','GRD','MFU Human Rights Club','Human Rights Club','MFU Human Rights Club activities'),
 ('OPEN9','youth','GRD','Maxim','Maxim','Maxim student organization activities'),
 ('OPEN10','youth','GRD','Bounce & Win','Bounce & Win','Student game booth'),
 ('OPEN11','youth','GRD','Chinese Fortune Stick','Fortune Stick','Chinese fortune-stick (kau chim) cultural game'),
 ('OPEN12','youth','MFii','Plang Plang (ปลัง ปลัง)','Plang Plang','Crispy Malabar-spinach rice topping by the Youth Savings project (Plang Plang)'),
 ('OPEN13','wellness','MFU Medical Center Hospital','First Aid Service','First Aid','Medical first aid service station'),
]

AREA = {
    'educational': 'Educational & Study Abroad',
    'cultural': 'Cultural',
    'food': 'International Food & Culture',
    'market': 'Open Space · Market',
    'youth': 'Open Space · Youth',
    'wellness': 'Wellness',
}

PRIZE_DESK_ID = None   # No booth is the prize desk yet; the organisers assign it separately.

booths = []
for i, (bid, cat, host, name_en, short, desc) in enumerate(ROWS):
    booths.append({
        'id': bid,
        'eventId': EVENT_ID,
        'nameEn': name_en,
        'nameTh': name_en,          # no Thai column in the sheet — see notes.md
        'shortName': short,
        'hostUnit': host,
        'category': cat,
        'location': AREA[cat],      # provisional — no floor plan yet
        'descriptionEn': desc,
        'descriptionTh': '',
        'accentColor': ACCENTS[i % len(ACCENTS)],
        'points': BASE_POINTS,
        'zone': 'entrance',         # flat points: zone kept only to satisfy the model
        'activeDays': EVENT_DAYS,
        'isPrizeDesk': bid == PRIZE_DESK_ID,
        'active': True,
        'sortOrder': i + 1,
    })

assert len({b['id'] for b in booths}) == len(booths), 'duplicate booth id'
assert len({b['nameEn'] for b in booths}) == len(booths), 'duplicate booth name'
assert sum(b['isPrizeDesk'] for b in booths) == 1, 'exactly one prize desk'

with open('booths.seed.json', 'w', encoding='utf-8') as f:
    json.dump(booths, f, ensure_ascii=False, indent=2)

from collections import Counter
c = Counter(b['category'] for b in booths)
print(f'{len(booths)} booths ->', dict(c))
print('max points on the floor:', len(booths) * BASE_POINTS)
print('booths needed for 100 pts: base', 100 // BASE_POINTS,
      '| all-quiet', -(-100 // round(BASE_POINTS * 1.25)),
      '| all-busy', -(-100 // round(BASE_POINTS * 0.75)))
print('prize desk:', PRIZE_DESK_ID)
