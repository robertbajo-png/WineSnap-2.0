param([ValidateSet('starting','legacy','unavailable','focus_failed')][string]$Kind)
$ErrorActionPreference='Stop'
if(-not $IsWindows){throw 'Windows is required.'}
Add-Type -AssemblyName System.Windows.Forms
$message=switch($Kind){
  starting {'WineSnap startas redan. Vanta en stund; appfonstret visas nar ditt konto ar klart.'}
  legacy {'WineSnap ar redan oppet med den tidigare lokala oppnaren. Spara ditt arbete och stang WineSnap-fonstret. Oppna sedan genvagen WineSnap lokalt igen. Inget losenord behover andras.'}
  unavailable {'WineSnap kunde inte starta lokalt. Kontrollera att Docker Desktop har startat och forsok sedan med genvagen igen. Inga konton eller losenord har andrats. Teknisk status finns via open-owned-local.ps1 -Action Status.'}
  focus_failed {'WineSnap ar fortfarande oppet men fonstret kunde inte lyftas fram. Valj WineSnap i aktivitetsfaltet. Inget nytt konto eller fonster har skapats.'}
}
[Windows.Forms.MessageBox]::Show($message,'WineSnap lokalt',[Windows.Forms.MessageBoxButtons]::OK,[Windows.Forms.MessageBoxIcon]::Information)|Out-Null
