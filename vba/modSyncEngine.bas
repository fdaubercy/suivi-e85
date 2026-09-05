Attribute VB_Name = "modSyncEngine"
' ============================================================
'  modSyncEngine - Moteur de sync GS<->Excel (X44 P2)
' ============================================================
'  SyncCore + import (GS->Excel) + helpers, extraits de modSyncGS.
'  L'export (Excel->GS) est extrait dans modSyncExport (X44 P4).
'  Config via modSyncCfg ; JSON via modSyncJson ; HTTP via modSyncNet.
'  Public : SyncCore, BuildLocalIndex, GraphSheetExists, ImportGSToExcel
'  (appeles par modSyncGS) + IsGarbageSid (partage avec modSyncExport).
Option Explicit

Private Sub SetStatus(msg As String)
    Application.StatusBar = "[Sync E85] " & msg
    Debug.Print Format(Now(), "hh:mm:ss") & "  " & msg
End Sub

Public Sub SyncCore(ByRef addedFromGS As Long, ByRef sentToGS As Long, _
                     silentIfEmpty As Boolean)
    Dim ws          As Worksheet
    Dim jsonStr     As String
    Dim gsRecs()    As String
    Dim localIds    As Object
    Dim updFromGS   As Long   ' v2.9 : MAJ GS->Excel
    Dim sentUpdToGS As Long   ' v2.9 : MAJ Excel->GS (bulkUpdate)
    Dim tStart      As Date   ' X11 : chrono pour _SyncLog

    On Error GoTo ErrHandler

    tStart = now   ' X46 : pose le chrono avant tout (journalisation KO incluse)
    SetStatus "Connexion a Google Sheets..."
    Application.Cursor = xlWait

    Set ws = ThisWorkbook.Sheets(WS_NAME)

    ' v2.9 : s'assurer que la col P est bien initialisee
    EnsureModifiedColHeader ws

    jsonStr = HttpGet(GAS_URL & "?action=export&token=" & APP_TOKEN & SyncSecretQS())

    If jsonStr = "" Then
        SetStatus "ERREUR reseau - lancer TestConnexion() pour diagnostiquer"
        On Error Resume Next
        LogToSyncLog 0, 0, DateDiff("s", tStart, now), "KO reseau"
        On Error GoTo ErrHandler
        GoTo Cleanup
    End If

    If InStr(jsonStr, """records""") = 0 Then
        SetStatus "ERREUR : reponse non-JSON - GAS pas re-deploye ? (TestConnexion pour details)"
        On Error Resume Next
        LogToSyncLog 0, 0, DateDiff("s", tStart, now), "KO reponse GAS"
        On Error GoTo ErrHandler
        GoTo Cleanup
    End If

    SetStatus "Parsing JSON GS..."
    gsRecs = ParseRecords(jsonStr)

    ' Direction 0 : suppressions GS -> Excel (S3). Les lignes tombstone
    ' (col R "Supprime" cote GS) sont renvoyees dans "deleted":[sync_id,...].
    SetStatus "Suppressions GS -> Excel..."
    Dim delIds() As String
    delIds = ParseDeletedIds(jsonStr)
    Dim delFromGS As Long
    delFromGS = ApplyGSDeletions(ws, delIds)

    Set localIds = BuildLocalIndex(ws)

    ' Direction 1 : GS -> Excel (nouvelles lignes + MAJ si non dirty)
    SetStatus "Import GS -> Excel..."
    addedFromGS = ImportGSToExcel(ws, gsRecs, localIds, updFromGS)

    ' Direction 2a : Excel -> GS (nouvelles lignes)
    SetStatus "Export Excel -> GS (nouvelles lignes)..."
    sentToGS = ExportExcelToGS(ws, gsRecs)

    ' Direction 2b : Excel -> GS (modifications locales -- col P renseignee)
    SetStatus "Export Excel -> GS (modifications)..."
    sentUpdToGS = ExportModificationsToGS(ws, gsRecs)

    ' Direction 3 : push liste curee des stations Excel -> GS (feuille "Stations")
    SetStatus "Export stations curees -> GS..."
    Dim pushedStations As Long
    pushedStations = PushStationsToGS()

    ' P1 : synchro des parametres metier (miroir local = bloc F/G/H de
    ' l'onglet "Notes") <-> onglet "Parametres" du Google Sheet.
    ' Module autonome ; ne bloque pas la sync des pleins en cas d'echec.
    SetStatus "Sync parametres metier..."
    On Error Resume Next
    Dim paramSync As Long
    paramSync = modSyncParametres.SyncParametres()
    On Error GoTo ErrHandler

    ' W91c : synchro des depenses d'entretien par vehicule (onglet "_Depenses"
    ' <-> "Depenses" du Google Sheet). Tolerant ; ne bloque pas la sync des pleins.
    SetStatus "Sync depenses d'entretien..."
    On Error Resume Next
    modSyncDepenses.SyncDepenses
    On Error GoTo ErrHandler

    ' Prix marche : rafraichit la Power Query "PrixHistory" depuis le Google
    ' Sheet (sinon l'onglet _PrixHistory local reste fige -> dates manquantes).
    ' Synchrone (BackgroundQuery=False) -> aucune donnee loupee. Tolerant.
    SetStatus "Refresh prix marche (_PrixHistory)..."
    On Error Resume Next
    RafraichirPrixHistory True
    On Error GoTo ErrHandler

    ' Bilan
    Dim msg As String
    msg = "OK :"
    msg = msg & " <-" & addedFromGS & " nouv."
    If updFromGS > 0 Then msg = msg & " +" & updFromGS & " MAJ"
    If delFromGS > 0 Then msg = msg & " -" & delFromGS & " suppr."
    msg = msg & " / ->" & sentToGS & " nouv."
    If sentUpdToGS > 0 Then msg = msg & " +" & sentUpdToGS & " MAJ"
    If pushedStations >= 0 Then msg = msg & " / stations:" & pushedStations
    If paramSync > 0 Then msg = msg & " / params:" & paramSync
    SetStatus msg

    ' X11 : journalise cette sync dans l'onglet _SyncLog (X46 : statut OK)
    On Error Resume Next
    LogToSyncLog addedFromGS, sentToGS, DateDiff("s", tStart, now), "OK"
    On Error GoTo ErrHandler

    ' Propage les lignes GS_Pleins -> vue derivee "Suivi Carburant" (Tableau2).
    ' Sans cela, un plein importe depuis Google Sheets reste dans GS_Pleins sans
    ' apparaitre dans "Suivi Carburant". Le nb de lignes change si ajout/suppr
    ' -> on realigne Tableau2 et on tire les colonnes brutes par formules INDEX.
    If (addedFromGS + delFromGS) > 0 Then
        On Error Resume Next
        modFeatures.SyncTableau2DepuisGS
        On Error GoTo ErrHandler
    End If

    ' v2.9.1 : recreation automatique des graphiques si des donnees ont
    ' change (ajout / MAJ dans un sens ou l'autre). Mode silencieux :
    ' aucune MsgBox bloquante meme a l'ouverture du classeur.
    ' X22 (v2.9.2) : on ne declenche QUE si l'onglet "Graphiques" existe
    ' deja -> pas de creation surprise sur un classeur qui ne s'en sert pas.
    If (addedFromGS + updFromGS + delFromGS + sentToGS + sentUpdToGS) > 0 Then
        ' X20 : declenche seulement si l'interrupteur "Graphiques auto" (B7) est actif
        If GraphSheetExists() And modGraphiques.GraphAutoActif() Then
            On Error Resume Next
            SetStatus msg & " / maj graphiques..."
            CreerGraphiquesWeb silent:=True
            SetStatus msg
            On Error GoTo 0
        End If
    End If

Cleanup:
    Application.Cursor = xlDefault
    Exit Sub

ErrHandler:
    Application.Cursor = xlDefault
    On Error Resume Next
    LogToSyncLog 0, 0, DateDiff("s", tStart, now), "KO " & Err.Description
    On Error GoTo 0
    SetStatus "ERREUR : " & Err.Description & " (TestConnexion pour verifier)"
End Sub

Public Function BuildLocalIndex(ws As Worksheet) As Object
    Dim dict    As Object
    Dim lastRow As Long
    Dim i       As Long
    Dim sid     As String

    Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = vbTextCompare
    lastRow = ws.Cells(ws.rows.count, 1).End(xlUp).row

    For i = 2 To lastRow
        sid = Trim(CStr(ws.Cells(i, COL_SYNC_ID).value))
        If sid <> "" Then dict(sid) = True
    Next i

    Set BuildLocalIndex = dict
End Function

Private Function BuildLocalRowMap(ws As Worksheet) As Object
    Dim dict    As Object
    Dim lastRow As Long
    Dim i       As Long
    Dim sid     As String

    Set dict = CreateObject("Scripting.Dictionary")
    dict.CompareMode = vbTextCompare
    lastRow = ws.Cells(ws.rows.count, 1).End(xlUp).row

    For i = 2 To lastRow
        sid = Trim(CStr(ws.Cells(i, COL_SYNC_ID).value))
        If sid <> "" Then dict(sid) = i
    Next i

    Set BuildLocalRowMap = dict
End Function

Public Function IsGarbageSid(ByVal sid As String) As Boolean
    ' Public : partage avec modSyncExport (X44 P4)
    IsGarbageSid = (StrComp(Trim$(sid), "sync_id", vbTextCompare) = 0)
End Function

Public Function GraphSheetExists() As Boolean
    ' X36 : l'onglet du dashboard (ex-"Graphiques") est renomme "Tableau de bord".
    ' Repli sur l'ancien nom "Graphiques" tant que le renommage n'est pas fait.
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Tableau de bord")
    If ws Is Nothing Then Set ws = ThisWorkbook.Worksheets("Graphiques")
    On Error GoTo 0
    GraphSheetExists = Not ws Is Nothing
End Function

Public Function ImportGSToExcel(ws As Worksheet, gsRecs() As String, _
                                  localIds As Object, _
                                  Optional ByRef updFromGS As Long = 0) As Long
    Dim added   As Long
    Dim tbl     As ListObject
    Dim i       As Long
    Dim rec     As String
    Dim sid     As String
    Dim rng     As Range
    Dim lr      As Long

    added = 0
    updFromGS = 0

    If ws.ListObjects.count > 0 Then Set tbl = ws.ListObjects(1)
    ForceFormatDates

    ' v2.9 : carte sid -> numero de ligne pour les MAJ
    Dim localRowMap As Object
    Set localRowMap = BuildLocalRowMap(ws)

    For i = 0 To UBound(gsRecs)
        rec = gsRecs(i)
        If Len(rec) < 10 Then GoTo NextRec

        sid = JsonGet(rec, "sync_id")
        If sid = "" Then GoTo NextRec
        ' Anti-corruption : ne jamais importer une ligne fantome (sync_id = "sync_id")
        If IsGarbageSid(sid) Then GoTo NextRec

        If Not localIds.Exists(sid) Then
            ' -- Nouvelle ligne depuis GS : ajout ------------------
            If Not tbl Is Nothing Then
                Set rng = tbl.ListRows.Add.Range
            Else
                lr = ws.Cells(ws.rows.count, 1).End(xlUp).row + 1
                Set rng = ws.Range(ws.Cells(lr, 1), ws.Cells(lr, COL_MODIFIED))
            End If

            rng(1).value = ParseDt(JsonGet(rec, "Horodatage"))
            rng(2).value = ParseDt(JsonGet(rec, "Date"))
            rng(3).value = JsonGet(rec, "Type")
            rng(4).value = ToNum(JsonGet(rec, "Km compteur"))
            rng(5).value = ToNum(JsonGet(rec, "Nb. Litres"))
            rng(6).value = ToNum(JsonGet(rec, k("Prix {E}/L")))
            rng(7).value = JsonGet(rec, "Station essence")
            rng(8).value = JsonGet(rec, k("V{e}hicule"))
            rng(9).value = ToNum(JsonGet(rec, k("E85 station ({E}/L)")))
            rng(10).value = ToNum(JsonGet(rec, k("SP98 station ({E}/L)")))
            rng(11).value = ToNum(JsonGet(rec, k("SP95 station ({E}/L)")))
            rng(12).value = ToNum(JsonGet(rec, k("E10 station ({E}/L)")))
            rng(13).value = ToNum(JsonGet(rec, k("Gazole station ({E}/L)")))
            rng(14).value = ToNum(JsonGet(rec, k("GPLc station ({E}/L)")))
            rng(15).value = sid
            rng(16).value = JsonGet(rec, "Photo ticket")   ' P - URL photo importee de GS
            ' Col 17 (Modifie_local) laissee vide : nouvelle ligne, propre

            localIds(sid) = True
            added = added + 1

        Else
            ' -- Ligne existante : MAJ GS->Excel si non dirty ------
            ' Col P vide = non modifie localement = GS peut ecraser
            ' Col P renseignee = Excel gagne (sera envoye en bulkUpdate)
            Dim rowNum As Long
            rowNum = 0
            If localRowMap.Exists(sid) Then rowNum = CLng(localRowMap(sid))
            If rowNum < 2 Then GoTo NextRec

            ' S5 : ligne locale "dirty" (col Q renseignee). On n'ignore plus
            ' systematiquement GS : on compare les horodatages et on garde le
            ' plus recent. Excel-wins seulement si GS n'est pas plus recent.
            If CStr(ws.Cells(rowNum, COL_MODIFIED).value) <> "" Then
                Dim localTs As Date, gsTs As Date
                Dim hasLocal As Boolean, hasGs As Boolean
                hasLocal = IsDate(ws.Cells(rowNum, COL_MODIFIED).value)
                If hasLocal Then localTs = CDate(ws.Cells(rowNum, COL_MODIFIED).value)
                Dim gsModV As Variant: gsModV = ParseDt(JsonGet(rec, k("Modifi{e}_le")))
                hasGs = IsDate(gsModV)
                If hasGs Then gsTs = CDate(gsModV)

                ' GS l'emporte seulement s'il est strictement plus recent
                If hasGs And (Not hasLocal Or gsTs > localTs) Then
                    If Not RowMatchesGS(ws, rowNum, rec) Then
                        UpdateRowFromGS ws, rowNum, rec
                        updFromGS = updFromGS + 1
                    End If
                    ' la version GS gagne : on abandonne la modif locale en attente
                    Application.EnableEvents = False
                    ws.Cells(rowNum, COL_MODIFIED).value = ""
                    Application.EnableEvents = True
                End If
                ' sinon : Excel >= GS -> on conserve la modif locale (bulkUpdate)
                GoTo NextRec
            End If

            ' Ligne non dirty : MAJ GS->Excel si GS differe
            If Not RowMatchesGS(ws, rowNum, rec) Then
                UpdateRowFromGS ws, rowNum, rec
                updFromGS = updFromGS + 1
            End If
        End If

NextRec:
    Next i

    ImportGSToExcel = added
End Function

Private Function RowMatchesGS(ws As Worksheet, r As Long, rec As String) As Boolean
    On Error GoTo NoMatch

    ' Date (yyyy-mm-dd)
    Dim lDate As String
    If IsDate(ws.Cells(r, 2).value) Then
        lDate = Format(CDate(ws.Cells(r, 2).value), "yyyy-mm-dd")
    End If
    Dim gDate As String: gDate = JsonGet(rec, "Date")
    If Len(gDate) >= 10 Then gDate = Left(gDate, 10)
    If lDate <> gDate Then GoTo NoMatch

    ' Km (tolerance 0.5)
    Dim lKm As Double: lKm = 0
    If IsNumeric(ws.Cells(r, 4).value) Then lKm = CDbl(ws.Cells(r, 4).value)
    Dim gKm As Double: gKm = 0
    Dim gKmStr As String: gKmStr = JsonGet(rec, "Km compteur")
    If IsNumeric(Replace(gKmStr, ".", ",")) Then gKm = CDbl(Replace(gKmStr, ".", ","))
    If Abs(lKm - gKm) > 0.5 Then GoTo NoMatch

    ' Litres (tolerance 0.01)
    Dim lLit As Double: lLit = 0
    If IsNumeric(ws.Cells(r, 5).value) Then lLit = CDbl(ws.Cells(r, 5).value)
    Dim gLit As Double: gLit = 0
    Dim gLitStr As String: gLitStr = JsonGet(rec, "Nb. Litres")
    If IsNumeric(Replace(gLitStr, ".", ",")) Then gLit = CDbl(Replace(gLitStr, ".", ","))
    If Abs(lLit - gLit) > 0.01 Then GoTo NoMatch

    RowMatchesGS = True
    Exit Function

NoMatch:
    RowMatchesGS = False
    On Error GoTo 0
End Function

Private Sub UpdateRowFromGS(ws As Worksheet, r As Long, rec As String)
    Application.EnableEvents = False
    On Error Resume Next
    ws.Cells(r, 2).value = ParseDt(JsonGet(rec, "Date"))
    ws.Cells(r, 3).value = JsonGet(rec, "Type")
    ws.Cells(r, 4).value = ToNum(JsonGet(rec, "Km compteur"))
    ws.Cells(r, 5).value = ToNum(JsonGet(rec, "Nb. Litres"))
    ws.Cells(r, 6).value = ToNum(JsonGet(rec, k("Prix {E}/L")))
    ws.Cells(r, 7).value = JsonGet(rec, "Station essence")
    ws.Cells(r, 8).value = JsonGet(rec, k("V{e}hicule"))
    ws.Cells(r, 9).value = ToNum(JsonGet(rec, k("E85 station ({E}/L)")))
    ws.Cells(r, 10).value = ToNum(JsonGet(rec, k("SP98 station ({E}/L)")))
    ws.Cells(r, 11).value = ToNum(JsonGet(rec, k("SP95 station ({E}/L)")))
    ws.Cells(r, 12).value = ToNum(JsonGet(rec, k("E10 station ({E}/L)")))
    ws.Cells(r, 13).value = ToNum(JsonGet(rec, k("Gazole station ({E}/L)")))
    ws.Cells(r, 14).value = ToNum(JsonGet(rec, k("GPLc station ({E}/L)")))
    ws.Cells(r, COL_PHOTO).value = JsonGet(rec, "Photo ticket")
    On Error GoTo 0
    Application.EnableEvents = True
End Sub

Private Function ApplyGSDeletions(ws As Worksheet, delIds() As String) As Long
    Dim cnt As Long: cnt = 0
    On Error GoTo done
    If UBound(delIds) < LBound(delIds) Then ApplyGSDeletions = 0: Exit Function

    Dim del As Object
    Set del = CreateObject("Scripting.Dictionary")
    del.CompareMode = vbTextCompare
    Dim i As Long
    For i = LBound(delIds) To UBound(delIds)
        If Trim(delIds(i)) <> "" Then del(Trim(delIds(i))) = True
    Next i
    If del.count = 0 Then ApplyGSDeletions = 0: Exit Function

    Dim tbl As ListObject
    If ws.ListObjects.count > 0 Then Set tbl = ws.ListObjects(1)

    Application.EnableEvents = False
    If Not tbl Is Nothing Then
        Dim li As Long, sidL As String
        For li = tbl.ListRows.count To 1 Step -1
            sidL = Trim(CStr(tbl.ListRows(li).Range.Cells(1, COL_SYNC_ID).value))
            If sidL <> "" Then
                If del.Exists(sidL) Then tbl.ListRows(li).Delete: cnt = cnt + 1
            End If
        Next li
    Else
        Dim lastRow As Long, r As Long, sid As String
        lastRow = ws.Cells(ws.rows.count, 1).End(xlUp).row
        For r = lastRow To 2 Step -1
            sid = Trim(CStr(ws.Cells(r, COL_SYNC_ID).value))
            If sid <> "" Then
                If del.Exists(sid) Then ws.rows(r).Delete: cnt = cnt + 1
            End If
        Next r
    End If
    Application.EnableEvents = True
    ApplyGSDeletions = cnt
    Exit Function
done:
    Application.EnableEvents = True
    ApplyGSDeletions = cnt
End Function

Private Function ToNum(s As String) As Variant
    If s = "" Or s = "null" Then
        ToNum = ""
    ElseIf IsNumeric(Replace(s, ".", ",")) Then
        ToNum = CDbl(Replace(s, ".", ","))
    Else
        ToNum = ""
    End If
End Function

Private Sub LogToSyncLog(ByVal fromGS As Long, ByVal toGS As Long, ByVal dureeS As Long, _
                         ByVal statut As String)
    Const LOG_SH As String = "_SyncLog"
    Dim wsL As Worksheet
    On Error Resume Next
    Set wsL = ThisWorkbook.Sheets(LOG_SH)
    On Error GoTo 0
    If wsL Is Nothing Then
        Set wsL = ThisWorkbook.Sheets.Add(After:=ThisWorkbook.Sheets(ThisWorkbook.Sheets.count))
        wsL.name = LOG_SH
        wsL.visible = xlSheetHidden
        wsL.Cells(1, 1).value = "Horodatage"
        wsL.Cells(1, 2).value = "<- GS"
        wsL.Cells(1, 3).value = "-> GS"
        wsL.Cells(1, 4).value = "Duree (s)"
        wsL.Cells(1, 5).value = "Statut"
        wsL.Range("A1:E1").Font.bold = True
    ElseIf CStr(wsL.Cells(1, 5).value) = "" Then
        ' Migration des journaux anterieurs a X46 (4 colonnes) : ajoute l'en-tete.
        wsL.Cells(1, 5).value = "Statut"
        wsL.Cells(1, 5).Font.bold = True
    End If
    Dim nxt As Long: nxt = wsL.Cells(wsL.rows.count, 1).End(xlUp).row + 1
    wsL.Cells(nxt, 1).value = now
    wsL.Cells(nxt, 1).NumberFormat = "dd/mm/yyyy hh:mm:ss"
    wsL.Cells(nxt, 2).value = fromGS
    wsL.Cells(nxt, 3).value = toGS
    wsL.Cells(nxt, 4).value = dureeS
    wsL.Cells(nxt, 5).value = statut
End Sub
