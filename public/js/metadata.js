let pages = [];
let pdfRenderTasks = [];
let pdffile = null
let deletedMetadata = [];

function responsiveDisplay() {
    let menu = document.getElementById('sidebarTools');
    let menuOffcanvas = new bootstrap.Offcanvas(menu);

    if(is_mobile()) {
        menu.classList.remove('show');
        menuOffcanvas.hide();
    } else {
        menuOffcanvas.show();
    }
    menu.classList.remove('d-md-block');
    menu.classList.remove('d-none');
};

async function loadPDF(pdfBlob) {
    let filename = pdfBlob.name;
    let url = await URL.createObjectURL(pdfBlob);
    document.title = filename + ' - ' + document.title;

    pdffile = pdfBlob
    let loadingTask = pdfjsLib.getDocument(url);
    document.querySelector('#text_document_name span').innerText = filename;
    await loadingTask.promise.then(function(pdf) {
        pdf.getMetadata().then(function(metadata) {
            for(fieldKey in defaultFields) {
                addMetadata(fieldKey, null, defaultFields[fieldKey]['type'], false);
            }

            for(metaKey in metadata.info) {
                if(metaKey == "Custom" || metaKey == "PDFFormatVersion" || metaKey.match(/^Is/) || metaKey == "Trapped") {
                    continue;
                }
                addMetadata(metaKey, metadata.info[metaKey], "text", false);
            }

            for(metaKey in metadata.info.Custom) {
                if(metaKey == "sha256") {
                    continue;
                }

                addMetadata(metaKey, metadata.info.Custom[metaKey], "text", false);
            }

            for(let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++ ) {
                pdf.getPage(pageNumber).then(function(page) {
                    let pageIndex = (page.pageNumber - 1);
                    pages[pageIndex] = page;
                    pageRender(pageIndex);
                });
            }
            if(document.querySelector('.input-metadata input')) {
                document.querySelector('.input-metadata input').focus();
            } else {
                document.getElementById('input_metadata_key').focus();
            }
        });
    }, function (reason) {
        console.error(reason);
    });

    return loadingTask;
}

async function pageRender(pageIndex) {

  let page = pages[pageIndex];

  let viewport = page.getViewport({scale: 1});
  let sizeWidth = document.getElementById('container-pages').offsetWidth;
  let scaleWidth = sizeWidth / viewport.width;
  let viewportWidth = page.getViewport({scale: scaleWidth });

  viewport = viewportWidth;

  let canvasPDF = document.createElement('canvas');
  canvasPDF.classList.add('shadow-sm');
  document.getElementById('container-pages').appendChild(canvasPDF);
  let context = canvasPDF.getContext('2d');
  canvasPDF.height = viewport.height;
  canvasPDF.width = viewport.width;

  if(pdfRenderTasks[pageIndex]) {
    pdfRenderTasks[pageIndex].cancel();
  }
  pdfRenderTasks[pageIndex] = await page.render({
    canvasContext: context,
    viewport: viewport,
  });
}

function addMetadata(key, value, type, focus) {
    let input = document.querySelector('.input-metadata input[name="'+key+'"]');

    if(input && !input.value) {
        input.value = value;
    }
    if(input && focus) {
        input.focus();
    }
    if(input) {
        return;
    }

    let div = document.createElement('div');
    div.classList.add('form-floating', 'mt-3', 'input-metadata');

    input = document.createElement('input');
    input.value = value;
    input.type = type;
    input.name = key;
    input.classList.add('form-control');

    let label = document.createElement('label');
    label.innerText = key;

    let deleteButton = document.createElement('div')
    deleteButton.title = "Supprimer cette metadonnée"
    deleteButton.innerHTML = "×"
    deleteButton.classList.add('delete-metadata')

    div.appendChild(input);
    div.appendChild(label);
    div.appendChild(deleteButton);
    document.getElementById('form-metadata-container').appendChild(div);

    if(focus) {
        input.focus();
    }
}

function deleteMetadata(el) {
    if (confirm("Souhaitez-vous supprimer ce champ ?") === false) return;

    const input = el.closest('.input-metadata')
    const label = input.querySelector('label').innerText
    deletedMetadata.push(label)
    input.remove()
}

async function save() {
    const PDFDocument = window['PDFLib'].PDFDocument
    const PDFHexString = window['PDFLib'].PDFHexString
    const PDFName = window['PDFLib'].PDFName

    const arrayBuffer = await pdffile.arrayBuffer();
    const pdf = await PDFDocument.load(arrayBuffer);

    deletedMetadata.forEach(function (el) {
        pdf.getInfoDict().delete(PDFName.of(el))
    });

    ([...document.getElementsByClassName('input-metadata')] || []).forEach(function (el) {
        const label = el.querySelector('label').innerText
        const input = el.querySelector('input').value

        pdf.getInfoDict().set(PDFName.of(label), PDFHexString.fromText(input));
    });

    const newPDF = new Blob([await pdf.save()], {type: "application/pdf"});

    if(window.location.hash && window.location.hash.match(/^\#local/)) {
        let apiUrl = window.location.origin + "/api/file/save?path=" + window.location.hash.replace(/^\#local:/, '');
        fetch(apiUrl, {
          method: 'PUT',
          body: newPDF,
        });
        return ;
    }
    download(newPDF, document.getElementById('input_pdf_upload').files[0].name)
}

function createEventsListener() {
    document.getElementById('form_metadata_add').addEventListener('submit', function(e) {
        let formData = new FormData(this);
        addMetadata(formData.get('metadata_key'), "", "text", true);
        this.classList.add('invisible');
        setTimeout(function() { document.getElementById('form_metadata_add').classList.remove('invisible'); }, 400);
        this.reset();
        e.preventDefault();
    });
    document.getElementById('input_metadata_value').addEventListener('focus', function(e) {
        if(document.getElementById('input_metadata_key').value) {
            document.querySelector('#form_metadata_add button').click();
        }
    });
    document.addEventListener('click', function (event) {
        if (event.target.closest(".delete-metadata")) {
            deleteMetadata(event.target)
        }
    })

    document.getElementById('save').addEventListener('click', function (e) {
        save()
    })
    document.getElementById('save_mobile').addEventListener('click', function (e) {
        save()
    })
}

async function pageUpload() {
    document.querySelector('body').classList.remove('bg-light');
    document.getElementById('input_pdf_upload').value = '';
    document.getElementById('page-upload').classList.remove('d-none');
    document.getElementById('page-metadata').classList.add('d-none');
    document.getElementById('input_pdf_upload').focus();
    window.addEventListener('hashchange', function() {
        window.location.reload();
    })
    document.getElementById('input_pdf_upload').addEventListener('change', async function(event) {
        if(await canUseCache()) {
            storeFileInCache();
            history.pushState({}, '', '/metadata#'+document.getElementById('input_pdf_upload').files[0].name);
        }
        pageMetadata(null);
    });
}

async function pageMetadata(url) {
    document.querySelector('body').classList.add('bg-light');
    document.getElementById('page-upload').classList.add('d-none');
    document.getElementById('page-metadata').classList.remove('d-none');
    if(url && url.match(/^cache:\/\//)) {
        await loadFileFromCache(url.replace(/^cache:\/\//, ''));
    } else if (url) {
        await loadFileFromUrl(url);
    }

    if(!document.getElementById('input_pdf_upload').files.length) {
        alert("Chargement du PDF impossible");
        document.location = '/metadata';
        return;
    }

    responsiveDisplay();
    createEventsListener();
    loadPDF(document.getElementById('input_pdf_upload').files[0]);
};


document.addEventListener('DOMContentLoaded', function () {
    if(window.location.hash && window.location.hash.match(/^\#http/)) {
        pageMetadata(window.location.hash.replace(/^\#/, ''));
    } else if(window.location.hash && window.location.hash.match(/^\#local/)) {
        pageMetadata(window.location.origin + "/api/file/get?path=" + window.location.hash.replace(/^\#local:/, ''), '/metadata', window.location.hash.replace(/^\#/, ''));
    } else if(window.location.hash) {
        pageMetadata('cache:///pdf/'+window.location.hash.replace(/^\#/, ''));
    } else {
        pageUpload();
    }

    window.addEventListener('hashchange', function() {
        window.location.reload();
    })
});
