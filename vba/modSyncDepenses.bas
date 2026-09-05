Attribute VB_Name = "modSyncDepenses"
' ============================================================
'  SUIVI E85 - Synchronisation des DEPENSES D'ENTRETIEN (W91c)
'  Google Sheets (onglet "Depenses") <-> Excel (feuille "_Depenses")
'
'  v1.0.0.0  [necessite Code.gs avec getDepenses / setDepenses (W91b)]
'
'  Modele : liste PAR VEHICULE. Synchro PAR LIGNE, last-write-wins sur
'  l'identifiant "id" (horodatage modifie_le, epoch ms UTC). Suppressions
'  propagees par tombstone "supprime" (0/1). Meme logique que modSyncGS
'  pour les pleins, adaptee a une table cle-multiple.
'
'  Miroir local = table "tblDepenses" sur la feuille TECHNIQUE "_Depenses"
'  (creee/masquee automatiquement). Colonnes :
'    A id | B vehicule | C date | D categorie | E intitule
'    F montant | G modifie_le | H supprime
'  Le calcul de rentabilite (modRentabilite) somme tblDepenses[montant]
'  filtre sur le vehicule selectionne (B3) dans COUT_TOTAL.
'
'  Points d'entree :
'    SyncDepenses         - synchro complete (appelee aussi par SyncCore).
'    SyncDepensesManuel   - idem, avec message de bilan en barre d'etat.
'    AjouterDepenseExcel  - saisie manuelle d'une depense depuis Excel (+ push).
'  Dependances partagees : HttpGet/HttpPost (modSyncNet), JsonGet/JEsc (modSyncJson).
' ============================================================
Option Explicit

Private Const GAS_URL   As String = "https://script.google.com/macros/s/AKfycbwIyCfZVTpDOGBANtFcHECcCdbg4J4t377pKQjIJ0NJYFT9FMjZm5_6XOsyQAas8jeTyA/exec"
Private Const APP_TOKEN As String = "e85_a7f3c9e21b8d4f60a5c3e8b7d12f6049"

Private Const WS_DEP    As String = "_Depenses"
Private Const TBL_DEP   As String = "tblDepenses"
Private Const HDR_ROW   As Long = 1

' Colonnes (1-based) de la table.
Private Const C_ID   As Long = 1
Private Const C_VEH  As Long = 2
Private Const C_DATE As Long = 3
Private Const C_CAT  As Long = 4
Private Const C_LIB  As Long = 5
Private Const C_MNT  As Long = 6
Private Const C_MOD  As Long = 7
Private Const C_SUP  As Long = 8

' --- Cle proprietaire (SYNC_SECRET), comme modSyncParametres ---
Private Function SyncSecret() As String
    SyncSecret = GetSetting("SuiviE85", "Sync", "OwnerSecret", "")
End Function
Private Function SyncSecretQS() As String
    Dim s As String: s = SyncSecret()
    If Len(s) > 0 Then SyncSecretQS = "&syncSecret=" & s Else SyncSecretQS = ""
End Function
Private Function SyncSecretJson() As String
    Dim s As String: s = SyncSecret()
    If Len(s) > 0 Then SyncSecretJson = ",""syncSecret"":""" & s & """" Else SyncSecretJson = ""
End Function

' ============================================================
'  POINTS D'ENTREE
' ============================================================
Public Sub SyncDepensesManuel()
    Dim n As Long
    n = SyncDepenses()
    If n >= 0 Then
        Application.StatusBar = "[Depenses] " & ChrW(10003) & " Synchronisees (" & _
            n & " maj) - " & Format(Now(), "hh:mm:ss")
    Else
        Application.StatusBar = "[Depenses] " & ChrW(9888) & " Echec reseau (voir TestConnexion)."
    End If
End Sub

' Renvoie le nombre de lignes appliquees/poussees, ou -1 si echec reseau.
Public Function SyncDepenses() As Long
    Dim lo As ListObject
    Dim dRow As Object, dMod As Object
    Dim resp As String
    Dim objs() As String
    Dim i As Long, nChanged As Long
    Dim toPush As String

    On Error GoTo EH
    Set lo = EnsureDepensesTable()
    If lo Is Nothing Then SyncDepenses = -1: Exit Function

    Set dRow = CreateObject("Scripting.Dictionary")
    Set dMod = CreateObject("Scripting.Dictionary")
    ReadLocal lo, dRow, dMod

    ' 1) Etat serveur
    resp = HttpGet(GAS_URL & "?action=getDepenses&token=" & APP_TOKEN & SyncSecretQS())
    If resp = "" Then SyncDepenses = -1: Exit Function
    If InStr(resp, """depenses""") = 0 Then SyncDepenses = -1: Exit Function

    objs = ParseArrayObjects(resp, "depenses")

    ' 2) Reconciliation LWW par id (serveur -> local)
    Dim srvSeen As Object: Set srvSeen = CreateObject("Scripting.Dictionary")
    For i = LBound(objs) To UBound(objs)
        If objs(i) <> "" Then
            Dim id As String: id = JsonGet(objs(i), "id")
            If id <> "" Then
                srvSeen(id) = True
                Dim sMod As Double: sMod = Val(JsonGet(objs(i), "modifie_le"))
                If Not dRow.Exists(id) Then
                    AppendRow lo, dRow, dMod, id, objs(i)
                    nChanged = nChanged + 1
                ElseIf sMod > dMod(id) Then
                    WriteRow lo, dRow(id), id, objs(i)
                    dMod(id) = sMod
                    nChanged = nChanged + 1
                ElseIf dMod(id) > sMod Then
                    toPush = AppendPushObj(toPush, RowToJson(lo, dRow(id)))
                End If
            End If
        End If
    Next i

    ' 3) Lignes locales absentes du serveur -> a pousser
    Dim k As Variant
    For Each k In dRow.Keys
        If Not srvSeen.Exists(CStr(k)) Then
            toPush = AppendPushObj(toPush, RowToJson(lo, dRow(CStr(k))))
        End If
    Next k

    ' 4) Pousser
    If toPush <> "" Then PushDepenses toPush

    SyncDepenses = nChanged
    Exit Function
EH:
    SyncDepenses = -1
End Function

' Saisie manuelle d'une depense depuis Excel (InputBox) + push immediat.
Public Sub AjouterDepenseExcel()
    Dim lo As ListObject
    Set lo = EnsureDepensesTable()
    If lo Is Nothing Then Exit Sub

    Dim veh As String, lib As String, mntS As String, cat As String
    veh = ThisWorkbook.Worksheets("Suivi Carburant").Range("B3").value
    If veh = "" Or veh = "(tous)" Then
        veh = InputBox("Vehicule concerne :", "Nouvelle depense")
        If veh = "" Then Exit Sub
    End If
    lib = InputBox("Intitule de la depense (ex. vidange) :", "Nouvelle depense")
    If lib = "" Then Exit Sub
    mntS = InputBox("Montant (" & ChrW(8364) & ") :", "Nouvelle depense")
    If mntS = "" Then Exit Sub
    Dim mnt As Double
    If Not IsNumeric(Replace(mntS, ".", ",")) Then
        MsgBox "Montant invalide.", vbExclamation: Exit Sub
    End If
    mnt = CDbl(Replace(mntS, ".", ","))
    cat = InputBox("Categorie (Entretien / Reparation / Kit / Autre) :", "Nouvelle depense", "Entretien")
    If cat <> "Reparation" And cat <> "Kit" And cat <> "Autre" Then cat = "Entretien"
    If cat = "Reparation" Then cat = "R" & ChrW(233) & "paration"

    Dim id As String, ts As Double
    id = NewId()
    ts = NowUtcMs()
    Dim lr As ListRow: Set lr = lo.ListRows.Add
    lr.Range.Cells(1, C_ID).value = id
    lr.Range.Cells(1, C_VEH).value = veh
    lr.Range.Cells(1, C_DATE).value = Format(Now(), "yyyy-mm-dd")
    lr.Range.Cells(1, C_CAT).value = cat
    lr.Range.Cells(1, C_LIB).value = lib
    lr.Range.Cells(1, C_MNT).value = mnt
    lr.Range.Cells(1, C_MOD).value = Format(ts, "0")
    lr.Range.Cells(1, C_SUP).value = 0

    Dim r As Long: r = lr.Range.row
    PushDepenses AppendPushObj("", RowToJson(lo, r))
    Application.StatusBar = "[Depenses] " & ChrW(10003) & " Depense ajoutee et poussee (" & lib & ")."
End Sub

' ============================================================
'  TABLE MIROIR (feuille technique "_Depenses")
' ============================================================
Private Function EnsureDepensesTable() As ListObject
    Dim ws As Worksheet, lo As ListObject
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(WS_DEP)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add
        ws.name = WS_DEP
        ws.Visible = xlSheetHidden
    End If

    On Error Resume Next
    Set lo = ws.ListObjects(TBL_DEP)
    On Error GoTo 0
    If lo Is Nothing Then
        ws.Cells(HDR_ROW, C_ID).value = "id"
        ws.Cells(HDR_ROW, C_VEH).value = "vehicule"
        ws.Cells(HDR_ROW, C_DATE).value = "date"
        ws.Cells(HDR_ROW, C_CAT).value = "categorie"
        ws.Cells(HDR_ROW, C_LIB).value = "intitule"
        ws.Cells(HDR_ROW, C_MNT).value = "montant"
        ws.Cells(HDR_ROW, C_MOD).value = "modifie_le"
        ws.Cells(HDR_ROW, C_SUP).value = "supprime"
        Set lo = ws.ListObjects.Add(xlSrcRange, _
            ws.Range(ws.Cells(HDR_ROW, C_ID), ws.Cells(HDR_ROW, C_SUP)), , xlYes)
        lo.name = TBL_DEP
        ' Force la date en texte (evite toute reinterpretation locale, cf. lecon #27).
        ws.Columns(C_DATE).NumberFormat = "@"
    End If
    Set EnsureDepensesTable = lo
End Function

' Assure l'existence de la table sans synchro (appele par modRentabilite avant
' d'ecrire la formule SUMIFS qui reference tblDepenses).
Public Sub EnsureDepensesReady()
    On Error Resume Next
    EnsureDepensesTable
    On Error GoTo 0
End Sub

Private Sub ReadLocal(lo As ListObject, dRow As Object, dMod As Object)
    If lo.ListRows.count = 0 Then Exit Sub
    Dim body As Range: Set body = lo.DataBodyRange
    Dim i As Long, id As String
    For i = 1 To body.Rows.count
        id = Trim(CStr(body.Cells(i, C_ID).value))
        If id <> "" Then
            dRow(id) = body.Cells(i, C_ID).row
            dMod(id) = Val(CStr(body.Cells(i, C_MOD).value))
        End If
    Next i
End Sub

' Ecrit toutes les colonnes d'une ligne (row absolu feuille) depuis un objet JSON.
Private Sub WriteRow(lo As ListObject, sheetRow As Long, id As String, obj As String)
    Dim ws As Worksheet: Set ws = lo.Range.Worksheet
    ws.Cells(sheetRow, C_ID).value = id
    ws.Cells(sheetRow, C_VEH).value = JsonGet(obj, "vehicule")
    ws.Cells(sheetRow, C_DATE).value = JsonGet(obj, "date")
    ws.Cells(sheetRow, C_CAT).value = JsonGet(obj, "categorie")
    ws.Cells(sheetRow, C_LIB).value = JsonGet(obj, "intitule")
    ws.Cells(sheetRow, C_MNT).value = ToNum(JsonGet(obj, "montant"))
    ws.Cells(sheetRow, C_MOD).value = Format(Val(JsonGet(obj, "modifie_le")), "0")
    ws.Cells(sheetRow, C_SUP).value = IIf(Val(JsonGet(obj, "supprime")) = 1, 1, 0)
End Sub

Private Sub AppendRow(lo As ListObject, dRow As Object, dMod As Object, id As String, obj As String)
    Dim lr As ListRow: Set lr = lo.ListRows.Add
    Dim r As Long: r = lr.Range.row
    WriteRow lo, r, id, obj
    dRow(id) = r
    dMod(id) = Val(JsonGet(obj, "modifie_le"))
End Sub

' ============================================================
'  JSON : ligne locale -> objet ; parsing tableau serveur
' ============================================================
Private Function RowToJson(lo As ListObject, sheetRow As Long) As String
    Dim ws As Worksheet: Set ws = lo.Range.Worksheet
    Dim mnt As Double: mnt = Val(Replace(CStr(ws.Cells(sheetRow, C_MNT).value), ",", "."))
    RowToJson = "{""id"":""" & JEsc(CStr(ws.Cells(sheetRow, C_ID).value)) & """," & _
        """vehicule"":""" & JEsc(CStr(ws.Cells(sheetRow, C_VEH).value)) & """," & _
        """date"":""" & JEsc(CStr(ws.Cells(sheetRow, C_DATE).value)) & """," & _
        """categorie"":""" & JEsc(CStr(ws.Cells(sheetRow, C_CAT).value)) & """," & _
        """intitule"":""" & JEsc(CStr(ws.Cells(sheetRow, C_LIB).value)) & """," & _
        """montant"":" & Replace(CStr(mnt), ",", ".") & "," & _
        """modifie_le"":" & Format(Val(CStr(ws.Cells(sheetRow, C_MOD).value)), "0") & "," & _
        """supprime"":" & IIf(Val(CStr(ws.Cells(sheetRow, C_SUP).value)) = 1, "1", "0") & "}"
End Function

Private Function AppendPushObj(acc As String, obj As String) As String
    If acc = "" Then AppendPushObj = obj Else AppendPushObj = acc & "," & obj
End Function

Private Sub PushDepenses(objsCsv As String)
    Dim body As String
    body = "{""action"":""setDepenses"",""token"":""" & APP_TOKEN & """" & _
           SyncSecretJson() & ",""depenses"":[" & objsCsv & "]}"
    HttpPost GAS_URL, body
End Sub

' Decoupe "<tag>":[ {..},{..} ] en objets JSON individuels.
Private Function ParseArrayObjects(jsonStr As String, tag As String) As String()
    Dim emp(0) As String: emp(0) = ""
    Dim p As Long, endP As Long, arr As String
    Dim marker As String: marker = """" & tag & """:["

    p = InStr(jsonStr, marker)
    If p = 0 Then ParseArrayObjects = emp: Exit Function
    p = p + Len(marker)
    endP = InStr(p, jsonStr, "]")
    If endP <= p Then ParseArrayObjects = emp: Exit Function

    arr = Trim(Mid(jsonStr, p, endP - p))
    If arr = "" Then ParseArrayObjects = emp: Exit Function

    Dim parts() As String, i As Long, n As Long, s As String, result() As String
    parts = Split(arr, "},{")
    n = UBound(parts)
    ReDim result(n)
    For i = 0 To n
        s = parts(i)
        If Left(s, 1) <> "{" Then s = "{" & s
        If Right(s, 1) <> "}" Then s = s & "}"
        result(i) = s
    Next i
    ParseArrayObjects = result
End Function

Private Function ToNum(s As String) As Double
    If s = "" Then ToNum = 0 Else ToNum = Val(Replace(s, ".", "."))
End Function

' Identifiant unique (base36 horodatage + aleatoire), aligne sur js/depenses.js.
Private Function NewId() As String
    Dim a As Double: a = (Now - DateSerial(1970, 1, 1)) * 86400000#
    Randomize
    NewId = Base36(CDbl(Int(a))) & Base36(CDbl(Int(Rnd * 60466176)))
End Function
Private Function Base36(ByVal v As Double) As String
    Const D As String = "0123456789abcdefghijklmnopqrstuvwxyz"
    Dim r As String, n As Double: n = v
    If n = 0 Then Base36 = "0": Exit Function
    Do While n > 0
        r = Mid(D, (n - Int(n / 36) * 36) + 1, 1) & r
        n = Int(n / 36)
    Loop
    Base36 = r
End Function

Private Function NowUtcMs() As Double
    Dim d As Object, utc As Date
    On Error GoTo Fallback
    Set d = CreateObject("WbemScripting.SWbemDateTime")
    d.SetVarDate Now, True
    utc = d.GetVarDate(False)
    NowUtcMs = (utc - DateSerial(1970, 1, 1)) * 86400000#
    Exit Function
Fallback:
    NowUtcMs = (Now - DateSerial(1970, 1, 1)) * 86400000#
End Function
