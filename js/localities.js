// js/localities.js
// Lista localităților principale per județ, folosită în formularul de contact
// și în cardurile admin pentru câmpul Localitate (datalist).

export const COUNTY_CITIES = {
  "Alba": [
    "Alba Iulia","Sebeș","Blaj","Aiud","Cugir","Ocna Mureș","Zlatna","Câmpeni",
    "Abrud","Baia de Arieș","Teiuș","Ocnița"
  ],
  "Arad": [
    "Arad","Lipova","Ineu","Curtici","Nădlac","Pecica","Sebiș",
    "Chișineu-Criș","Pâncota","Sântana","Olari"
  ],
  "Argeș": [
    "Pitești","Câmpulung","Curtea de Argeș","Mioveni","Costești",
    "Topoloveni","Ștefănești","Rucar","Bascov"
  ],
  "Bacău": [
    "Bacău","Onești","Moinești","Comănești","Buhuși","Slănic-Moldova",
    "Târgu Ocna","Dărmănești","Podu Turcului","Răcăciuni"
  ],
  "Bihor": [
    "Oradea","Salonta","Marghita","Beiuș","Valea lui Mihai","Aleșd",
    "Stei","Nucet","Ștei","Vașcău"
  ],
  "Bistrița-Năsăud": [
    "Bistrița","Năsăud","Beclean","Sângeorz-Băi","Câmpia Turzii"
  ],
  "Botoșani": [
    "Botoșani","Dorohoi","Darabani","Săveni","Bucecea","Flămânzi",
    "Stefănești","Trușești"
  ],
  "Brăila": [
    "Brăila","Ianca","Făurei","Însurăței","Chișcani","Tichilești"
  ],
  "Brașov": [
    "Brașov","Codlea","Săcele","Ghimbav","Râșnov","Predeal","Zărnești",
    "Rupea","Făgăraș","Victoria","Cristian","Bod"
  ],
  "București": [
    "București","Sector 1","Sector 2","Sector 3","Sector 4","Sector 5","Sector 6"
  ],
  "Buzău": [
    "Buzău","Râmnicu Sărat","Nehoiu","Pogoanele","Pătârlagele","Berca"
  ],
  "Caraș-Severin": [
    "Reșița","Caransebeș","Bocșa","Oravița","Băile Herculane","Anina",
    "Moldova Nouă","Oțelu Roșu"
  ],
  "Călărași": [
    "Călărași","Oltenița","Lehliu-Gară","Budești","Fundulea"
  ],
  "Cluj": [
    "Cluj-Napoca","Turda","Dej","Câmpia Turzii","Gherla","Huedin",
    "Florești","Apahida","Baciu","Ocna Mureș","Câțcău"
  ],
  "Constanța": [
    "Constanța","Mangalia","Medgidia","Eforie","Năvodari","Cernavodă",
    "Hârșova","Ovidiu","Techirghiol","Murfatlar","Negru Vodă","Basarabi",
    "Băneasa","Limanu"
  ],
  "Covasna": [
    "Sfântu Gheorghe","Târgu Secuiesc","Covasna","Întorsura Buzăului",
    "Baraolt","Bixad"
  ],
  "Dâmbovița": [
    "Târgoviște","Moreni","Pucioasa","Titu","Găești","Fieni",
    "Răcari","Boteni"
  ],
  "Dolj": [
    "Craiova","Băilești","Calafat","Filiaș","Segarcea","Dăbuleni",
    "Bechet","Bulzești"
  ],
  "Galați": [
    "Galați","Tecuci","Târgu Bujor","Berești","Pechea","Tulucești"
  ],
  "Giurgiu": [
    "Giurgiu","Bolintin-Vale","Mihăilești","Găujani","Vânători"
  ],
  "Gorj": [
    "Târgu Jiu","Motru","Rovinari","Târgu Cărbunești","Bumbești-Jiu",
    "Novaci","Turceni","Tismana","Peștișani"
  ],
  "Harghita": [
    "Miercurea Ciuc","Odorheiu Secuiesc","Gheorgheni","Toplița",
    "Cristuru Secuiesc","Borsec","Vlăhița","Bălan"
  ],
  "Hunedoara": [
    "Deva","Hunedoara","Petroșani","Brad","Orăștie","Lupeni","Petrila",
    "Vulcan","Uricani","Aninoasa","Simeria","Călan","Hațeg"
  ],
  "Ialomița": [
    "Slobozia","Urziceni","Fetești","Fierbinți-Târg","Amara",
    "Căzănești","Andrasida"
  ],
  "Iași": [
    "Iași","Pașcani","Hârlău","Târgu Frumos","Ungheni",
    "Podu Iloaiei","Nicolina","Letcani"
  ],
  "Ilfov": [
    "Buftea","Otopeni","Voluntari","Popești-Leordeni","Bragadiru",
    "Pantelimon","Chitila","Măgurele","Tunari","Stefăneștii de Jos",
    "Cornetu","Glina","Clinceni"
  ],
  "Maramureș": [
    "Baia Mare","Sighetu Marmației","Borșa","Vișeu de Sus","Târgu Lăpuș",
    "Seini","Cavnic","Șomcuta Mare","Dragomirești"
  ],
  "Mehedinți": [
    "Drobeta-Turnu Severin","Orșova","Strehaia","Vânju Mare",
    "Baia de Aramă","Ilovița"
  ],
  "Mureș": [
    "Târgu Mureș","Reghin","Sighișoara","Târnăveni","Luduș","Sovata",
    "Iernut","Cristești","Ungheni","Sângeorgiu de Mureș"
  ],
  "Neamț": [
    "Piatra Neamț","Roman","Târgu Neamț","Bicaz","Roznov",
    "Buhuși","Borca","Ceahlău"
  ],
  "Olt": [
    "Slatina","Caracal","Balș","Corabia","Scornicești","Drăgănești-Olt",
    "Piatra-Olt","Potcoava"
  ],
  "Prahova": [
    "Ploiești","Câmpina","Sinaia","Bușteni","Azuga","Breaza",
    "Vălenii de Munte","Boldești-Scăeni","Urlați","Băicoi","Mizil",
    "Câmpina","Comarnic","Plopeni","Slănic"
  ],
  "Satu Mare": [
    "Satu Mare","Carei","Negrești-Oaș","Ardud","Tășnad",
    "Livada","Certeze"
  ],
  "Sălaj": [
    "Zalău","Șimleu Silvaniei","Jibou","Cehu Silvaniei",
    "Zimbor","Agrij"
  ],
  "Sibiu": [
    "Sibiu","Mediaș","Copșa Mică","Cisnădie","Dumbrăveni",
    "Ocna Sibiului","Avrig","Agnita","Miercurea Sibiului","Tălmaciu"
  ],
  "Suceava": [
    "Suceava","Rădăuți","Câmpulung Moldovenesc","Fălticeni",
    "Vatra Dornei","Siret","Gura Humorului","Broșteni","Liteni"
  ],
  "Teleorman": [
    "Alexandria","Roșiorii de Vede","Turnu Măgurele","Zimnicea",
    "Videle","Cervenia"
  ],
  "Timiș": [
    "Timișoara","Lugoj","Sânnicolau Mare","Deta","Jimbolia",
    "Buziaș","Recaș","Gătaia","Dumbrăvița","Ghiroda"
  ],
  "Tulcea": [
    "Tulcea","Babadag","Isaccea","Măcin","Sulina","Chilia Veche"
  ],
  "Vâlcea": [
    "Râmnicu Vâlcea","Drăgășani","Băile Olănești","Băile Govora",
    "Călimănești","Ocnele Mari","Brezoi","Horezu"
  ],
  "Vaslui": [
    "Vaslui","Bârlad","Huși","Negrești","Murgeni","Zorleni"
  ],
  "Vrancea": [
    "Focșani","Adjud","Panciu","Mărășești","Odobești",
    "Vidra","Soveja"
  ],
};
