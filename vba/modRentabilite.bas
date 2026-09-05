Attribute VB_Name = "modRentabilite"
' ============================================================
'  modRentabilite - Parametrage de la rentabilite du kit E85
' ============================================================
'  Installe (idempotent) sur la feuille "Suivi Carburant" :
'   - le bloc "COUT DE CONVERSION" (M5:O14) : postes de cout one-off
'     (pose, carte grise, entretien, assurance, aide deduite) + cout total,
'     carburant de reference (ecart EUR/L) et N pleins recents (projection) ;
'   - les Names classeur associes (COUT_BOITIER, COUT_POSE, ... PROJ_NB_RECENTS) ;
'   - le recablage des formules de rentabilite (equiv ref, reste a amortir,
'     progression, surconso gardee, date mediane + marge).
'
'  SECURITE DONNEES : strictement additif. Les valeurs par defaut ne sont
'  ecrites QUE si la cellule est vide (preserve les saisies utilisateur au
'  re-run). Aucune suppression de ligne/donnee. Feuille deprotegee/reprotegee.
'
'  Point d'entree : InstallerParametresRentabilite (re-executable).
'  Conventions : modValidation (G1/G5), modSyncGS.EnsureGSHeaders (X48).
Option Explicit

Private Const WS_SUIVI As String = "Suivi Carburant"

'--- Point d'entree unique, re-executable -----------------------------------
Public Sub InstallerParametresRentabilite()
    Dim ws As Worksheet
    Set ws = SheetSuivi()
    If ws Is Nothing Then
        MsgBox "Feuille '" & WS_SUIVI & "' introuvable.", vbExclamation
        Exit Sub
    End If

    Dim wasProtected As Boolean: wasProtected = ws.ProtectContents
    UnprotectSuivi ws

    modSyncDepenses.EnsureDepensesReady   ' W91c : table tblDepenses avant la formule SUMIFS de N11
    EnsureCostBlock ws          ' X68 : bloc cout + Names + COUT_TOTAL
    EnsureCarburantRefDropdown ws ' W89 : liste deroulante N12 (SP98/SP95/E10/GAZOLE)
    EnsureSurconsoGuard ws      ' X70 : J8 borne + avertissement
    EnsureDieselRefParams ws    ' W89 : conso/vehicule diesel de reference (R13/R14/R15)
    EnsureEquivRefFormula ws    ' X67/W89 : colonne equiv (essence ECART_REF ou diesel)
    EnsureCoutTotalWiring ws    ' X68 : B12 / J13 sur COUT_TOTAL
    EnsureProjection ws         ' X69 : J11/J12 mediane + marge

    If wasProtected Then ReprotectSuivi ws
    ThisWorkbook.Save
    Application.StatusBar = "[Rentabilite] " & ChrW(10003) & " Parametres installes/verifies."
End Sub

'--- Task 1 : bloc COUT DE CONVERSION + Names + COUT_TOTAL -------------------
Private Sub EnsureCostBlock(ws As Worksheet)
    ' Bloc en 3e colonne du panneau parametres : M=libelle, N=valeur, O=note.
    ' Lignes 5..14 (verifiees libres hors table des pleins qui commence L16).
    SetLabel ws, 5, 13, "COUT DE CONVERSION", True
    SetLabel ws, 6, 13, "Pose / main-d'" & ChrW(339) & "uvre (" & ChrW(8364) & ")", False
    SetLabel ws, 7, 13, "Modification carte grise (" & ChrW(8364) & ")", False
    SetLabel ws, 8, 13, "Entretiens (ancien - voir onglet D" & ChrW(233) & "penses)", False
    SetLabel ws, 9, 13, "Surco" & ChrW(251) & "t d'assurance (" & ChrW(8364) & ")", False
    SetLabel ws, 10, 13, "Aide / subvention d" & ChrW(233) & "duite (" & ChrW(8364) & ")", False
    SetLabel ws, 11, 13, "CO" & ChrW(219) & "T TOTAL conversion (" & ChrW(8364) & ")", True
    SetLabel ws, 12, 13, "Carburant de r" & ChrW(233) & "f" & ChrW(233) & "rence", False
    SetLabel ws, 13, 13, "" & ChrW(201) & "cart r" & ChrW(233) & "f. vs SP98 (" & ChrW(8364) & "/L)", False
    SetLabel ws, 14, 13, "Nb pleins r" & ChrW(233) & "cents (projection)", False

    ' Valeurs par defaut - UNIQUEMENT si la cellule est vide (preserve saisies)
    SetDefaultNum ws, 6, 14, 0        ' N6  pose
    SetDefaultNum ws, 7, 14, 0        ' N7  carte grise
    SetDefaultNum ws, 8, 14, 0        ' N8  entretien
    SetDefaultNum ws, 9, 14, 0        ' N9  assurance
    SetDefaultNum ws, 10, 14, 0       ' N10 aide deduite
    SetDefaultStr ws, 12, 14, "SP98"  ' N12 carburant de reference (informatif)
    SetDefaultNum ws, 13, 14, 0       ' N13 ecart ref EUR/L
    SetDefaultNum ws, 14, 14, 6       ' N14 N pleins recents

    ' Notes (colonne O) - libelles d'aide, ecrasables
    SetLabel ws, 6, 15, ChrW(8592) & " 0 si pose DIY", False
    SetLabel ws, 10, 15, ChrW(8592) & " soustraite du total", False
    SetLabel ws, 11, 15, ChrW(8592) & " bo" & ChrW(238) & "tier + postes " & ChrW(8722) & " aide + d" & ChrW(233) & "penses", False
    SetLabel ws, 13, 15, ChrW(8592) & " 0 = comparer au SP98", False

    ' Names classeur (crees si absents)
    EnsureName "COUT_BOITIER", "$B$6"
    EnsureName "COUT_POSE", "$N$6"
    EnsureName "COUT_CARTEGRISE", "$N$7"
    EnsureName "COUT_ENTRETIEN", "$N$8"
    EnsureName "SURCOUT_ASSURANCE", "$N$9"
    EnsureName "AIDE_DEDUITE", "$N$10"
    EnsureName "COUT_TOTAL", "$N$11"
    EnsureName "CARBURANT_REF", "$N$12"
    EnsureName "ECART_REF", "$N$13"
    EnsureName "PROJ_NB_RECENTS", "$N$14"

    ' Formule cout total (Formula2 : evite l'intersection implicite @).
    ' W91c : l'entretien scalaire (COUT_ENTRETIEN) est remplace par la somme des
    ' depenses d'entretien du vehicule selectionne (B3) via la table tblDepenses.
    ws.Range("N11").Formula2 = _
        "=MAX(0,COUT_BOITIER+COUT_POSE+COUT_CARTEGRISE+SURCOUT_ASSURANCE-AIDE_DEDUITE" & _
        "+IFERROR(SUMIFS(tblDepenses[montant],tblDepenses[vehicule]," & _
        "IF($B$3=""(tous)"",""*"",$B$3),tblDepenses[supprime],0),0))"

    ' Relabel du poste boitier dans le bloc parametres de gauche (A6)
    ws.Range("A6").value = "Co" & ChrW(251) & "t du bo" & ChrW(238) & "tier (kit) (" & ChrW(8364) & ")"
End Sub

'--- Task 6 (X70) : garde-fou surconso J8 + avertissement ---------------------
Private Sub EnsureSurconsoGuard(ws As Worksheet)
    Dim typ As String, veh As String, conso As String, selV As String, e85 As String, s98 As String
    Dim q As String: q = """"
    typ = "Tableau2[Type]"
    veh = "Tableau2[V" & ChrW(233) & "hicule]"
    conso = "Tableau2[Conso. (L/100km)]"
    selV = "IF($B$3=""(tous)"",""*"",$B$3)"
    e85 = """SuperEthanol E85"""
    s98 = """Super 98"""
    ' surconso = conso E85 / conso S98 ref - 1, bornee a [0,15 ; 0,40] via MEDIAN.
    ws.Range("J8").Formula2 = _
        "=IF(OR(B7="""",B7=0,COUNTIFS(" & typ & "," & e85 & "," & veh & "," & selV & ")=0),0.2," & _
        "MEDIAN(0.15,AVERAGEIFS(" & conso & "," & typ & "," & e85 & "," & veh & "," & selV & ")/B7-1,0.4))"
    ' Avertissement (L8) si moins de 4 pleins SP98 de reference pour ce vehicule.
    ws.Range("L8").Formula2 = _
        "=IF(COUNTIFS(" & typ & "," & s98 & "," & veh & "," & selV & ")<4," & _
        q & ChrW(9888) & " surconso peu fiable (n<4 pleins SP98)" & q & "," & q & q & ")"
End Sub

'--- W89 : liste deroulante du carburant de reference sur N12 -----------------
Private Sub EnsureCarburantRefDropdown(ws As Worksheet)
    ' Validation "liste" integree a la cellule N12 : SP98/SP95/E10/GAZOLE.
    ' N12 deverrouillee pour rester editable quand la feuille est protegee.
    On Error Resume Next
    ws.Range("N12").Locked = False
    With ws.Range("N12").Validation
        .Delete
        .Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, _
             Operator:=xlBetween, Formula1:="SP98,SP95,E10,GAZOLE"
        .IgnoreBlank = True
        .InCellDropdown = True
        .ShowInput = True
        .ShowError = True
        .InputTitle = "Carburant de reference"
        .InputMessage = "Choisir le carburant auquel comparer l'E85 (GAZOLE = diesel)."
    End With
    On Error GoTo 0
End Sub

'--- W89 : parametres de comparaison au diesel (zone auxiliaire Q/R) -----------
Private Sub EnsureDieselRefParams(ws As Worksheet)
    ' R13 = conso diesel manuelle (synchronisee app, repli berline 5,5) ;
    ' R14 = vehicule diesel de reference (texte, synchronise) ;
    ' R15 = conso diesel EFFECTIVE (mesuree sur les pleins gazole du vehicule
    '       choisi, sinon manuelle, sinon 5,5) -> Name CONSO_DIESEL_REF.
    SetLabel ws, 13, 17, "conso diesel manuel", False    ' Q13
    SetLabel ws, 14, 17, "vehicule diesel ref", False    ' Q14
    SetLabel ws, 15, 17, "conso diesel eff.", False       ' Q15
    SetDefaultNum ws, 13, 18, 5.5                          ' R13 (si vide)
    EnsureName "CONSO_DIESEL_MANUEL", "$R$13"
    EnsureName "VEHICULE_DIESEL_REF", "$R$14"
    EnsureName "CONSO_DIESEL_REF", "$R$15"

    Dim conso As String: conso = "Tableau2[Conso. (L/100km)]"
    Dim veh As String:   veh = "Tableau2[V" & ChrW(233) & "hicule]"
    Dim typ As String:   typ = "Tableau2[Type]"
    Dim mesure As String
    mesure = "AVERAGEIFS(" & conso & "," & veh & ",VEHICULE_DIESEL_REF," & typ & ",""*azole*"")"
    Dim repli As String: repli = "IF(CONSO_DIESEL_MANUEL>0,CONSO_DIESEL_MANUEL,5.5)"
    ws.Range("R15").Formula2 = _
        "=IF(VEHICULE_DIESEL_REF=""""," & repli & _
        ",IFERROR(IF(" & mesure & ">0," & mesure & "," & repli & ")," & repli & "))"
End Sub

'--- Task 3 (X67/W89) : colonne "Cout Plein equiv." (essence ecart OU diesel) --
Private Sub EnsureEquivRefFormula(ws As Worksheet)
    Dim lo As ListObject: Set lo = ws.ListObjects("Tableau2")
    Dim idx As Long: idx = 0
    Dim i As Long
    For i = 1 To lo.ListColumns.count
        If InStr(1, lo.ListColumns(i).name, "quiv", vbTextCompare) > 0 Then idx = i: Exit For
    Next i
    If idx = 0 Then Exit Sub
    Dim eu As String: eu = ChrW(8364)
    Dim prixS98 As String: prixS98 = "[@[Prix S98 jour (" & eu & "/L)]]"
    Dim lit As String: lit = "[@[Nb. Litres]]"
    ' Prix gazole du plein : INDEX aligne sur GS_Pleins (comme colonnes O/P).
    Dim gaz As String
    gaz = "IFERROR(INDEX(GS_Pleins[Gazole station],ROW()-ROW(Tableau2[#Headers])),0)"
    ' consoE85 = conso S98 ref (B7) * (1 + surconso J8).
    Dim consoE85 As String: consoE85 = "($B$7*(1+$J$8))"
    ' Branche essence (X67) : litres/(1+surconso) * (prix S98 - ecart, >=0).
    Dim essence As String
    essence = "IF(OR(" & lit & "=""""," & prixS98 & "=""""),""""," & _
              lit & "/(1+$J$8)*MAX(0," & prixS98 & "-ECART_REF))"
    ' Branche diesel (W89) : litres * (consoDiesel/consoE85) * prix gazole du plein.
    Dim diesel As String
    diesel = "IF(OR(" & lit & "=""""," & consoE85 & "<=0," & gaz & "<=0),""""," & _
             lit & "*(CONSO_DIESEL_REF/" & consoE85 & ")*" & gaz & ")"
    lo.ListColumns(idx).DataBodyRange.Formula2 = _
        "=IF([@Type]<>""SuperEthanol E85"",""""," & _
        "IF(CARBURANT_REF=""GAZOLE""," & diesel & "," & essence & "))"
End Sub

'--- Task 4 (X68) : reste a amortir & progression sur COUT_TOTAL ---------------
Private Sub EnsureCoutTotalWiring(ws As Worksheet)
    ws.Range("B12").Formula2 = "=MAX(0,COUT_TOTAL-B11)"
    ws.Range("J13").Formula2 = "=IFERROR(IF(COUT_TOTAL<=0,1,MIN(B11/COUT_TOTAL,1)),0)"
End Sub

'--- Task 5 (X69) : date de rentabilite mediane (rythme moyen/recent) + marge --
Private Sub EnsureProjection(ws As Worksheet)
    Dim eu As String: eu = ChrW(8364)
    Dim q As String: q = """"
    Dim typ As String, veh As String, km As String, dt As String, eco As String
    Dim selV As String, e85 As String, boolSel As String
    typ = "Tableau2[Type]"
    veh = "Tableau2[V" & ChrW(233) & "hicule]"
    km = "Tableau2[Km compteur]"
    dt = "Tableau2[Date]"
    eco = "Tableau2[" & ChrW(201) & "conomie cumul" & ChrW(233) & "e (" & eu & ")]"
    selV = "IF($B$3=""(tous)"",""*"",$B$3)"
    e85 = """SuperEthanol E85"""
    boolSel = "(" & typ & "=" & e85 & ")*((" & veh & "=$B$3)+($B$3=""(tous)"")>0)"

    ' Cellules auxiliaires (zone libre Q/R lignes 3-12) + labels en Q
    SetLabel ws, 3, 17, "aux projection", True
    SetLabel ws, 4, 17, "taux moyen", False:   ws.Range("R4").Formula2 = "=B13"
    SetLabel ws, 5, 17, "km E85 max", False:    ws.Range("R5").Formula2 = "=MAXIFS(" & km & "," & typ & "," & e85 & "," & veh & "," & selV & ")"
    SetLabel ws, 6, 17, "km N avant", False:    ws.Range("R6").Formula2 = "=IFERROR(LARGE(IF(" & boolSel & "," & km & "),PROJ_NB_RECENTS+1),MINIFS(" & km & "," & typ & "," & e85 & "," & veh & "," & selV & "))"
    SetLabel ws, 7, 17, "eco N avant", False:   ws.Range("R7").Formula2 = "=IFERROR(SUMIFS(" & eco & "," & km & ",KM_N_AGO," & typ & "," & e85 & "," & veh & "," & selV & "),0)"
    SetLabel ws, 8, 17, "taux recent", False:   ws.Range("R8").Formula2 = "=IFERROR(IF((KME85_MAX-KM_N_AGO)<=0,TAUX_MOYEN,IF((B11-ECOCUM_N_AGO)/(KME85_MAX-KM_N_AGO)<=0,TAUX_MOYEN,(B11-ECOCUM_N_AGO)/(KME85_MAX-KM_N_AGO))),TAUX_MOYEN)"
    SetLabel ws, 9, 17, "rythme km/j", False:   ws.Range("R9").Formula2 = "=IFERROR((MAXIFS(" & km & "," & veh & "," & selV & ")-MINIFS(" & km & "," & veh & "," & selV & "))/(MAXIFS(" & dt & "," & veh & "," & selV & ")-MINIFS(" & dt & "," & veh & "," & selV & ")),0)"
    SetLabel ws, 10, 17, "km actuel", False:    ws.Range("R10").Formula2 = "=MAXIFS(" & km & "," & veh & "," & selV & ")"
    SetLabel ws, 11, 17, "derniere date", False: ws.Range("R11").Formula2 = "=MAXIFS(" & dt & "," & veh & "," & selV & ")"
    SetLabel ws, 12, 17, "date A / B", False
    ws.Range("R12").Formula2 = "=IFERROR(LAST_DATE+(B12/TAUX_MOYEN)/RYTHME_KMJ,LAST_DATE)"
    ws.Range("S12").Formula2 = "=IFERROR(LAST_DATE+(B12/TAUX_RECENT)/RYTHME_KMJ,LAST_DATE)"

    EnsureName "TAUX_MOYEN", "$R$4"
    EnsureName "KME85_MAX", "$R$5"
    EnsureName "KM_N_AGO", "$R$6"
    EnsureName "ECOCUM_N_AGO", "$R$7"
    EnsureName "TAUX_RECENT", "$R$8"
    EnsureName "RYTHME_KMJ", "$R$9"
    EnsureName "KM_ACTUEL", "$R$10"
    EnsureName "LAST_DATE", "$R$11"
    EnsureName "DATE_A", "$R$12"
    EnsureName "DATE_B", "$S$12"

    ' J11 = mediane des deux dates ; J12 = mediane des deux km cibles ; marge en L11
    ws.Range("J11").Formula2 = "=IFERROR(IF(B12=0,LAST_DATE,(DATE_A+DATE_B)/2),""En attente de plus de pleins"")"
    ws.Range("J12").Formula2 = "=IFERROR(IF(B12=0,KM_ACTUEL,KM_ACTUEL+((B12/TAUX_MOYEN)+(B12/TAUX_RECENT))/2),""En attente d'un plein E85"")"
    ws.Range("L11").Formula2 = "=IF(B12=0," & q & q & "," & q & ChrW(177) & " " & q & "&ROUND(ABS(DATE_A-DATE_B)/2,0)&" & q & " j" & q & ")"
    ws.Range("K11").value = ChrW(8592) & " M" & ChrW(233) & "diane rythme moyen/r" & ChrW(233) & "cent"
End Sub

'--- Helpers ----------------------------------------------------------------
Private Function SheetSuivi() As Worksheet
    On Error Resume Next
    Set SheetSuivi = ThisWorkbook.Worksheets(WS_SUIVI)
    On Error GoTo 0
End Function

Private Sub UnprotectSuivi(ws As Worksheet)
    On Error Resume Next
    ws.Unprotect Password:=""
    On Error GoTo 0
End Sub

Private Sub ReprotectSuivi(ws As Worksheet)
    On Error Resume Next
    ws.Protect Password:="", UserInterfaceOnly:=True, _
        DrawingObjects:=False, Contents:=True, Scenarios:=False, _
        AllowFormattingColumns:=True
    On Error GoTo 0
End Sub

' Ecrit un libelle (toujours). bold=True pour titres.
Private Sub SetLabel(ws As Worksheet, r As Long, c As Long, txt As String, bold As Boolean)
    ws.Cells(r, c).value = txt
    ws.Cells(r, c).Font.bold = bold
End Sub

' Ecrit une valeur numerique par defaut UNIQUEMENT si la cellule est vide.
Private Sub SetDefaultNum(ws As Worksheet, r As Long, c As Long, v As Double)
    If IsEmptyCell(ws.Cells(r, c)) Then ws.Cells(r, c).value = v
End Sub

Private Sub SetDefaultStr(ws As Worksheet, r As Long, c As Long, v As String)
    If IsEmptyCell(ws.Cells(r, c)) Then ws.Cells(r, c).value = v
End Sub

Private Function IsEmptyCell(rg As Range) As Boolean
    IsEmptyCell = (Len(CStr(rg.value & "")) = 0)
End Function

' Cree un Name classeur pointant sur "Suivi Carburant"!ref s'il n'existe pas.
Private Sub EnsureName(nm As String, ref As String)
    Dim exists As Boolean: exists = False
    Dim n As Name
    On Error Resume Next
    For Each n In ThisWorkbook.names
        If StrComp(n.name, nm, vbTextCompare) = 0 Then exists = True: Exit For
    Next n
    If Not exists Then
        ThisWorkbook.names.Add name:=nm, _
            RefersTo:="='" & WS_SUIVI & "'!" & ref
    End If
    On Error GoTo 0
End Sub
