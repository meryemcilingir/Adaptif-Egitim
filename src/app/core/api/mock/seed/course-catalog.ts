import { CognitiveLevel } from '../../../../features/adaptive-learning/models/common.model';

/**
 * Program ve ders katalogu — demo veri setinin iskeleti.
 *
 * `prerequisites` alanı AYNI ders içindeki kazanımların 0 tabanlı sırasını gösterir;
 * böylece önkoşul grafiği gerçekten katmanlı (topolojik) bir yapı oluşturur.
 */

export interface OutcomeBlueprint {
  readonly title: string;
  readonly description: string;
  readonly level: CognitiveLevel;
  readonly prerequisites: readonly number[];
}

export interface CourseBlueprint {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly programCode: string;
  readonly color: string;
  readonly outcomes: readonly OutcomeBlueprint[];
}

export interface ProgramBlueprint {
  readonly code: string;
  readonly name: string;
}

export const PROGRAM_CATALOG: readonly ProgramBlueprint[] = [
  { code: 'TBM', name: 'Temel Bilimler Programı' },
  { code: 'BLM', name: 'Bilgisayar Mühendisliği' },
  { code: 'EEM', name: 'Elektrik-Elektronik Mühendisliği' },
  { code: 'MAK', name: 'Makine Mühendisliği' },
  { code: 'END', name: 'Endüstri Mühendisliği' },
  { code: 'INS', name: 'İnşaat Mühendisliği' },
  { code: 'MBG', name: 'Moleküler Biyoloji ve Genetik' },
  { code: 'IVB', name: 'İstatistik ve Veri Bilimi' },
  { code: 'YZM', name: 'Yazılım Mühendisliği' },
  { code: 'YZD', name: 'Yapay Zekâ ve Veri Mühendisliği' },
];

const PALETTE = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#F43F5E',
  '#8B5CF6',
  '#14B8A6',
  '#64748B',
];

/** Katalog sırasına göre deterministik renk atar. */
function color(index: number): string {
  return PALETTE[index % PALETTE.length]!;
}

export const COURSE_CATALOG: readonly CourseBlueprint[] = [
  {
    code: 'MAT101',
    name: 'Matematiksel Analiz I',
    description:
      'Limit, süreklilik, türev ve integral kavramlarının kuramsal temelleri ile mühendislik uygulamaları.',
    programCode: 'TBM',
    color: color(0),
    outcomes: [
      {
        title: 'Limit kavramını tanımlar',
        description: 'Fonksiyon limitinin epsilon-delta tanımını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Süreklilik koşullarını açıklar',
        description: 'Bir noktada sürekliliğin üç koşulunu örnekle açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Türev kurallarını uygular',
        description: 'Çarpım, bölüm ve zincir kuralını bileşik fonksiyonlarda uygular.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Maksimum-minimum problemlerini çözer',
        description: 'Birinci ve ikinci türev testleriyle uç değerleri belirler.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Belirli integrali hesaplar',
        description: 'Riemann toplamı ve temel teoremi kullanarak alan hesaplar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'İntegral tekniklerini seçer',
        description: 'Değişken değiştirme ve kısmi integrasyon arasında gerekçeli seçim yapar.',
        level: 'analyze',
        prerequisites: [4],
      },
      {
        title: 'Uygulamalı problemleri modeller',
        description: 'Fiziksel bir durumu türev/integral modeline dönüştürür.',
        level: 'evaluate',
        prerequisites: [3, 5],
      },
    ],
  },

  {
    code: 'FIZ102',
    name: 'Fizik II: Mekanik',
    description: 'Newton mekaniği, korunum yasaları ve katı cisim dinamiği.',
    programCode: 'TBM',
    color: color(1),
    outcomes: [
      {
        title: 'Vektörel büyüklükleri tanır',
        description: 'Skaler ve vektörel büyüklükleri ayırt eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Newton yasalarını açıklar',
        description: 'Üç hareket yasasını günlük örneklerle açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Serbest cisim diyagramı çizer',
        description: 'Karmaşık sistemlerde kuvvetleri doğru şekilde gösterir.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Enerji korunumunu uygular',
        description: 'Sürtünmeli ve sürtünmesiz sistemlerde enerji dengesi kurar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Momentum problemlerini çözer',
        description: 'Esnek ve esnek olmayan çarpışmaları çözümler.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Dönme dinamiğini çözümler',
        description: 'Eylemsizlik momenti ve açısal momentum korunumunu kullanır.',
        level: 'analyze',
        prerequisites: [4],
      },
    ],
  },

  {
    code: 'BIL203',
    name: 'Veri Yapıları ve Algoritmalar',
    description: 'Temel veri yapıları, algoritma tasarımı ve karmaşıklık analizi.',
    programCode: 'BLM',
    color: color(2),
    outcomes: [
      {
        title: 'Karmaşıklık gösterimini tanımlar',
        description: 'Big-O, Big-Theta ve Big-Omega gösterimlerini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Dizi ve bağlı listeyi karşılaştırır',
        description: 'Erişim, ekleme ve silme maliyetlerini gerekçelendirir.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Yığın ve kuyruk uygular',
        description: 'LIFO/FIFO yapılarını problem çözümünde kullanır.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Ağaç yapılarını uygular',
        description: 'İkili arama ağacında ekleme, silme ve dolaşma gerçekler.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Sıralama algoritmalarını çözümler',
        description: 'Merge, quick ve heap sort algoritmalarını maliyet açısından karşılaştırır.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Graf algoritmalarını uygular',
        description: 'BFS, DFS ve en kısa yol algoritmalarını uygular.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Algoritma seçimini gerekçelendirir',
        description: 'Verilen kısıtlar altında en uygun algoritmayı seçip savunur.',
        level: 'evaluate',
        prerequisites: [4, 5],
      },
    ],
  },

  {
    code: 'IST201',
    name: 'Olasılık ve İstatistik',
    description: 'Olasılık kuramı, dağılımlar, örnekleme ve hipotez testleri.',
    programCode: 'IVB',
    color: color(3),
    outcomes: [
      {
        title: 'Olasılık aksiyomlarını tanımlar',
        description: 'Kolmogorov aksiyomlarını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Koşullu olasılığı açıklar',
        description: 'Bayes teoremini örnek üzerinde açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Kesikli dağılımları uygular',
        description: 'Binom ve Poisson dağılımlarını problem çözümünde kullanır.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Sürekli dağılımları uygular',
        description: 'Normal dağılımla olasılık ve z-skoru hesaplar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Güven aralığı kurar',
        description: 'Örneklem büyüklüğüne göre güven aralığı hesaplar.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Hipotez testi yorumlar',
        description: 'p-değerini bağlam içinde doğru yorumlar.',
        level: 'evaluate',
        prerequisites: [4],
      },
    ],
  },

  {
    code: 'KIM110',
    name: 'Genel Kimya',
    description: 'Atom yapısı, periyodik özellikler, bağlar ve stokiyometri.',
    programCode: 'TBM',
    color: color(4),
    outcomes: [
      {
        title: 'Atom yapısını tanımlar',
        description: 'Atom altı parçacıkları ve elektron dizilimini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Periyodik eğilimleri açıklar',
        description: 'İyonlaşma enerjisi ve elektronegatiflik eğilimlerini açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Kimyasal bağları sınıflandırır',
        description: 'İyonik, kovalent ve metalik bağı ayırt eder.',
        level: 'understand',
        prerequisites: [1],
      },
      {
        title: 'Stokiyometri hesabı yapar',
        description: 'Mol kavramıyla sınırlayıcı bileşen problemlerini çözer.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Tepkime verimini çözümler',
        description: 'Kuramsal ve gerçek verim farkını yorumlar.',
        level: 'analyze',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'BIL301',
    name: 'Veritabanı Sistemleri',
    description: 'İlişkisel model, normalizasyon, SQL ve işlem yönetimi.',
    programCode: 'BLM',
    color: color(5),
    outcomes: [
      {
        title: 'İlişkisel modeli tanımlar',
        description: 'Tablo, anahtar ve ilişki kavramlarını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Varlık-ilişki diyagramı okur',
        description: 'ER diyagramını ilişkisel şemaya çevirir.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'SQL sorgusu yazar',
        description: 'Birleştirme, gruplama ve alt sorgu içeren sorgular oluşturur.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Normalizasyon uygular',
        description: 'Bir şemayı 3NF biçimine dönüştürür.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'İşlem yalıtımını çözümler',
        description: 'ACID özellikleri ve yalıtım düzeylerini karşılaştırır.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Sorgu başarımını değerlendirir',
        description: 'İndeks stratejisini maliyet analizine dayanarak savunur.',
        level: 'evaluate',
        prerequisites: [4],
      },
    ],
  },

  {
    code: 'EEM205',
    name: 'Devre Analizi',
    description: 'Doğru ve alternatif akım devrelerinin çözümlenmesi.',
    programCode: 'EEM',
    color: color(6),
    outcomes: [
      {
        title: 'Devre elemanlarını tanır',
        description: 'Direnç, kondansatör ve bobinin davranışını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Kirchhoff yasalarını açıklar',
        description: 'Akım ve gerilim yasalarını devre üzerinde açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Düğüm gerilimi yöntemini uygular',
        description: 'Çok düğümlü devrelerde denklem sistemi kurar.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Thevenin eşdeğerini çıkarır',
        description: 'Karmaşık devreyi eşdeğer kaynağa indirger.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Geçici rejimi çözümler',
        description: 'RC ve RL devrelerinde zaman sabitini yorumlar.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'AC devre başarımını değerlendirir',
        description: 'Fazör analiziyle güç faktörünü yorumlar.',
        level: 'evaluate',
        prerequisites: [4],
      },
    ],
  },

  {
    code: 'EEM310',
    name: 'Sayısal Elektronik',
    description: 'Mantık kapıları, ardışıl devreler ve sayısal tasarım.',
    programCode: 'EEM',
    color: color(7),
    outcomes: [
      {
        title: 'Sayı sistemlerini tanır',
        description: 'İkilik, sekizlik ve onaltılık gösterimleri dönüştürür.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Mantık kapılarını açıklar',
        description: 'Temel kapıların doğruluk tablolarını yorumlar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Boole sadeleştirmesi yapar',
        description: 'Karnaugh haritasıyla ifadeyi indirger.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Ardışıl devre tasarlar',
        description: 'Flip-flop kullanarak sayıcı tasarlar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Durum makinesi çözümler',
        description: 'Moore ve Mealy makinelerini karşılaştırır.',
        level: 'analyze',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'MAK220',
    name: 'Termodinamik',
    description: 'Enerji, entropi ve termodinamik çevrimler.',
    programCode: 'MAK',
    color: color(0),
    outcomes: [
      {
        title: 'Termodinamik sistemleri tanımlar',
        description: 'Açık, kapalı ve yalıtılmış sistemleri ayırt eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Birinci yasayı açıklar',
        description: 'Enerji korunumunu kontrol hacminde açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Hâl denklemlerini uygular',
        description: 'İdeal gaz ve buhar tablolarıyla hesap yapar.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Entropi değişimini hesaplar',
        description: 'Tersinir ve tersinmez süreçlerde entropi hesaplar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Çevrim verimini çözümler',
        description: 'Carnot, Rankine ve Otto çevrimlerini karşılaştırır.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Sistem tasarımını değerlendirir',
        description: 'Verim iyileştirme önerisini gerekçelendirir.',
        level: 'evaluate',
        prerequisites: [4],
      },
    ],
  },

  {
    code: 'MAK315',
    name: 'Akışkanlar Mekaniği',
    description: 'Akışkan statiği, süreklilik ve boru akışı.',
    programCode: 'MAK',
    color: color(1),
    outcomes: [
      {
        title: 'Akışkan özelliklerini tanır',
        description: 'Yoğunluk, viskozite ve basınç kavramlarını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Hidrostatik basıncı açıklar',
        description: 'Derinlikle basınç değişimini açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Süreklilik denklemini uygular',
        description: 'Kütle korunumunu boru sistemlerinde uygular.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Bernoulli denklemini uygular',
        description: 'Enerji denklemiyle hız ve basınç ilişkisini çözer.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Sürtünme kayıplarını çözümler',
        description: 'Reynolds sayısına göre kayıp hesabı yapar.',
        level: 'analyze',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'END240',
    name: 'Yöneylem Araştırması',
    description: 'Doğrusal programlama, ağ modelleri ve karar analizi.',
    programCode: 'END',
    color: color(2),
    outcomes: [
      {
        title: 'Karar değişkenlerini tanımlar',
        description: 'Bir problemi matematiksel model bileşenlerine ayırır.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Doğrusal modeli açıklar',
        description: 'Amaç fonksiyonu ve kısıtları yorumlar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Simpleks yöntemini uygular',
        description: 'Standart formdaki modeli simpleks ile çözer.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Duyarlılık analizi yapar',
        description: 'Katsayı değişiminin çözüme etkisini inceler.',
        level: 'analyze',
        prerequisites: [2],
      },
      {
        title: 'Ağ modellerini uygular',
        description: 'En kısa yol ve maksimum akış problemlerini çözer.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Model seçimini gerekçelendirir',
        description: 'Problem yapısına uygun modeli savunur.',
        level: 'evaluate',
        prerequisites: [3, 4],
      },
    ],
  },

  {
    code: 'END330',
    name: 'Kalite Yönetimi',
    description: 'İstatistiksel süreç kontrolü ve süreç iyileştirme.',
    programCode: 'END',
    color: color(3),
    outcomes: [
      {
        title: 'Kalite kavramlarını tanımlar',
        description: 'Kalite boyutlarını ve maliyet bileşenlerini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Değişkenlik kaynaklarını açıklar',
        description: 'Genel ve özel neden ayrımını açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Kontrol grafiği kurar',
        description: 'X-bar ve R grafiklerini veriden oluşturur.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Süreç yeterliliğini hesaplar',
        description: 'Cp ve Cpk göstergelerini yorumlar.',
        level: 'analyze',
        prerequisites: [2],
      },
      {
        title: 'İyileştirme önerisi geliştirir',
        description: 'Kök neden analizine dayalı öneri sunar.',
        level: 'evaluate',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'INS210',
    name: 'Statik ve Mukavemet',
    description: 'Denge, kesit tesirleri ve gerilme-şekil değiştirme.',
    programCode: 'INS',
    color: color(4),
    outcomes: [
      {
        title: 'Denge koşullarını tanımlar',
        description: 'Kuvvet ve moment dengesini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Mesnet tepkilerini açıklar',
        description: 'Mesnet türlerine göre tepki bileşenlerini belirler.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Kesit tesir diyagramı çizer',
        description: 'Kesme kuvveti ve moment diyagramlarını oluşturur.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Gerilme hesabı yapar',
        description: 'Normal ve kayma gerilmelerini hesaplar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Kesit güvenliğini çözümler',
        description: 'Emniyet gerilmesine göre kesit yeterliliğini inceler.',
        level: 'analyze',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'INS340',
    name: 'Betonarme Tasarım',
    description: 'Betonarme eleman davranışı ve tasarım esasları.',
    programCode: 'INS',
    color: color(5),
    outcomes: [
      {
        title: 'Malzeme davranışını tanır',
        description: 'Beton ve donatının gerilme-şekil değiştirme ilişkisini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Limit durum tasarımını açıklar',
        description: 'Taşıma gücü ve kullanılabilirlik sınırlarını açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Kiriş donatısı hesaplar',
        description: 'Eğilme etkisi altında donatı alanını belirler.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Kesme donatısı tasarlar',
        description: 'Etriye aralığını yönetmelik koşullarına göre belirler.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Tasarım seçeneklerini değerlendirir',
        description: 'Maliyet ve güvenlik dengesini gerekçelendirir.',
        level: 'evaluate',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'MBG150',
    name: 'Hücre Biyolojisi',
    description: 'Hücre yapısı, organeller ve hücresel süreçler.',
    programCode: 'MBG',
    color: color(6),
    outcomes: [
      {
        title: 'Hücre organellerini tanır',
        description: 'Organellerin yapı ve görevlerini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Zar taşınımını açıklar',
        description: 'Pasif ve aktif taşınım farkını açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Hücre döngüsünü uygular',
        description: 'Mitoz evrelerini mikroskop görüntüsünde tanımlar.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Sinyal yolaklarını çözümler',
        description: 'Reseptör-ligand etkileşimini yorumlar.',
        level: 'analyze',
        prerequisites: [2],
      },
      {
        title: 'Deney sonucunu değerlendirir',
        description: 'Hücresel deney verisini gerekçelendirerek yorumlar.',
        level: 'evaluate',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'MBG320',
    name: 'Moleküler Genetik',
    description: 'DNA replikasyonu, gen ifadesi ve genetik mühendisliği.',
    programCode: 'MBG',
    color: color(7),
    outcomes: [
      {
        title: 'Nükleik asit yapısını tanır',
        description: 'DNA ve RNA yapısal farklarını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Replikasyonu açıklar',
        description: 'Yarı korunumlu replikasyon mekanizmasını açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Gen ifadesini uygular',
        description: 'Transkripsiyon ve translasyon adımlarını izler.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'PCR tasarımı yapar',
        description: 'Primer tasarımını hedef diziye göre gerçekleştirir.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Mutasyon etkisini çözümler',
        description: 'Nokta mutasyonlarının protein üzerindeki etkisini inceler.',
        level: 'analyze',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'IVB260',
    name: 'Veri Görselleştirme',
    description: 'Görsel kodlama ilkeleri, grafik seçimi ve anlatı tasarımı.',
    programCode: 'IVB',
    color: color(0),
    outcomes: [
      {
        title: 'Görsel kodlamaları tanır',
        description: 'Konum, uzunluk ve renk kanallarını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Grafik türlerini açıklar',
        description: 'Veri tipine uygun grafik seçimini açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Görselleştirme üretir',
        description: 'Bir veri setinden anlamlı grafik oluşturur.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Yanıltıcı grafikleri çözümler',
        description: 'Eksen manipülasyonu gibi hataları tespit eder.',
        level: 'analyze',
        prerequisites: [2],
      },
      {
        title: 'Anlatı tasarımını değerlendirir',
        description: 'Hedef kitleye uygunluğu gerekçelendirir.',
        level: 'evaluate',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'IVB410',
    name: 'Çok Değişkenli İstatistik',
    description: 'Regresyon, boyut indirgeme ve kümeleme yöntemleri.',
    programCode: 'IVB',
    color: color(1),
    outcomes: [
      {
        title: 'Kovaryans yapısını tanımlar',
        description: 'Kovaryans ve korelasyon matrislerini ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Çoklu regresyonu açıklar',
        description: 'Katsayıların yorumunu ve varsayımları açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Model uydurur',
        description: 'Veri setine çoklu regresyon modeli uygular.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Boyut indirger',
        description: 'Temel bileşenler analizini uygular.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Model uygunluğunu çözümler',
        description: 'Artık analizi ve çoklu bağlantıyı inceler.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Yöntem seçimini savunur',
        description: 'Veri yapısına uygun yöntemi gerekçelendirir.',
        level: 'evaluate',
        prerequisites: [4],
      },
    ],
  },

  {
    code: 'YZM250',
    name: 'Yazılım Mimarisi',
    description: 'Katmanlı mimari, tasarım desenleri ve kalite nitelikleri.',
    programCode: 'YZM',
    color: color(2),
    outcomes: [
      {
        title: 'Mimari kavramları tanır',
        description: 'Bileşen, bağlayıcı ve görünüm kavramlarını ifade eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Katmanlı mimariyi açıklar',
        description: 'Bağımlılık yönü kurallarını açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Tasarım deseni uygular',
        description: 'Uygun deseni verilen probleme uygular.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Kalite ödünleşimlerini çözümler',
        description: 'Başarım ve sürdürülebilirlik dengesini inceler.',
        level: 'analyze',
        prerequisites: [2],
      },
      {
        title: 'Mimari kararı savunur',
        description: 'Karar kaydını gerekçeleriyle sunar.',
        level: 'evaluate',
        prerequisites: [3],
      },
    ],
  },

  {
    code: 'YZD380',
    name: 'Makine Öğrenmesine Giriş',
    description: 'Denetimli öğrenme, model değerlendirme ve genelleme.',
    programCode: 'YZD',
    color: color(3),
    outcomes: [
      {
        title: 'Öğrenme türlerini tanır',
        description: 'Denetimli, denetimsiz ve pekiştirmeli öğrenmeyi ayırt eder.',
        level: 'remember',
        prerequisites: [],
      },
      {
        title: 'Aşırı uydurmayı açıklar',
        description: 'Yanlılık-varyans dengesini açıklar.',
        level: 'understand',
        prerequisites: [0],
      },
      {
        title: 'Sınıflandırıcı eğitir',
        description: 'Veri setine lojistik regresyon uygular.',
        level: 'apply',
        prerequisites: [1],
      },
      {
        title: 'Model başarımını ölçer',
        description: 'Kesinlik, duyarlılık ve F1 ölçütlerini hesaplar.',
        level: 'apply',
        prerequisites: [2],
      },
      {
        title: 'Model hatalarını çözümler',
        description: 'Karışıklık matrisinden hata örüntüsü çıkarır.',
        level: 'analyze',
        prerequisites: [3],
      },
      {
        title: 'Model seçimini değerlendirir',
        description: 'Uygulama bağlamına göre model tercihini savunur.',
        level: 'evaluate',
        prerequisites: [4],
      },
    ],
  },
];
